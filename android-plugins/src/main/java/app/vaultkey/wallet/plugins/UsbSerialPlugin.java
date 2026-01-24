package app.vaultkey.wallet.plugins;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.hoho.android.usbserial.driver.CdcAcmSerialDriver;
import com.hoho.android.usbserial.driver.ProbeTable;
import com.hoho.android.usbserial.driver.UsbSerialDriver;
import com.hoho.android.usbserial.driver.UsbSerialPort;
import com.hoho.android.usbserial.driver.UsbSerialProber;
import com.hoho.android.usbserial.util.SerialInputOutputManager;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "UsbSerial")
public class UsbSerialPlugin extends Plugin implements SerialInputOutputManager.Listener {
    private static final String TAG = "UsbSerialPlugin";
    private static final String ACTION_USB_PERMISSION = "app.vaultkey.wallet.USB_PERMISSION";
    
    // Raspberry Pi Pico vendor/product IDs
    private static final int PICO_VENDOR_ID = 0x2E8A;  // 11914 in decimal
    private static final int PICO_PRODUCT_ID_CDC = 0x000A;  // Pico CDC serial
    private static final int PICO_PRODUCT_ID_STDIO = 0x0003;  // Pico stdio USB
    private static final int PICO_PRODUCT_ID_CUSTOM = 0x000C;  // Custom firmware
    
    private UsbManager usbManager;
    private UsbSerialPort serialPort;
    private UsbDeviceConnection connection;
    private SerialInputOutputManager ioManager;
    private StringBuilder dataBuffer = new StringBuilder();
    private PluginCall pendingPermissionCall;
    private UsbSerialProber customProber;
    
    private final BroadcastReceiver usbReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            
            if (ACTION_USB_PERMISSION.equals(action)) {
                synchronized (this) {
                    UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                        Log.d(TAG, "USB permission granted for device: " + device);
                        if (pendingPermissionCall != null && device != null) {
                            connectToDevice(device, pendingPermissionCall);
                            pendingPermissionCall = null;
                        }
                    } else {
                        Log.d(TAG, "USB permission denied");
                        if (pendingPermissionCall != null) {
                            JSObject result = new JSObject();
                            result.put("success", false);
                            result.put("error", "USB permission denied. Please grant USB access to connect to your Pico wallet.");
                            pendingPermissionCall.resolve(result);
                            pendingPermissionCall = null;
                        }
                    }
                }
            } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) {
                UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                if (device != null) {
                    Log.d(TAG, "USB device attached: VID=" + device.getVendorId() + " PID=" + device.getProductId() + " Name=" + device.getDeviceName());
                    JSObject deviceInfo = createDeviceInfo(device);
                    JSObject eventData = new JSObject();
                    eventData.put("device", deviceInfo);
                    notifyListeners("usbAttached", eventData);
                }
            } else if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                if (device != null) {
                    Log.d(TAG, "USB device detached: " + device.getDeviceName());
                    disconnect();
                    notifyListeners("usbDisconnected", new JSObject());
                }
            }
        }
    };
    
    @Override
    public void load() {
        usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        
        // Create custom prober that includes Raspberry Pi Pico
        ProbeTable customTable = new ProbeTable();
        // Add Raspberry Pi Pico with all known product IDs using CDC ACM driver
        customTable.addProduct(PICO_VENDOR_ID, PICO_PRODUCT_ID_CDC, CdcAcmSerialDriver.class);
        customTable.addProduct(PICO_VENDOR_ID, PICO_PRODUCT_ID_STDIO, CdcAcmSerialDriver.class);
        customTable.addProduct(PICO_VENDOR_ID, PICO_PRODUCT_ID_CUSTOM, CdcAcmSerialDriver.class);
        // Also add wildcard for any Pico variant (0x0001 to 0x00FF)
        for (int pid = 0x0001; pid <= 0x00FF; pid++) {
            customTable.addProduct(PICO_VENDOR_ID, pid, CdcAcmSerialDriver.class);
        }
        customProber = new UsbSerialProber(customTable);
        
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_USB_PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(usbReceiver, filter);
        }
        
        Log.d(TAG, "UsbSerialPlugin loaded with custom Pico prober");
    }
    
    @Override
    protected void handleOnDestroy() {
        try {
            getContext().unregisterReceiver(usbReceiver);
        } catch (Exception e) {
            Log.e(TAG, "Error unregistering receiver", e);
        }
        disconnect();
        super.handleOnDestroy();
    }
    
    private JSObject createDeviceInfo(UsbDevice device) {
        JSObject info = new JSObject();
        info.put("deviceId", device.getDeviceId());
        info.put("vendorId", device.getVendorId());
        info.put("productId", device.getProductId());
        info.put("deviceName", device.getDeviceName());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            info.put("productName", device.getProductName());
            info.put("manufacturerName", device.getManufacturerName());
        }
        // Flag if this is a known Pico device
        info.put("isPico", device.getVendorId() == PICO_VENDOR_ID);
        return info;
    }
    
    @PluginMethod
    public void getDevices(PluginCall call) {
        JSObject result = new JSObject();
        JSObject devices = new JSObject();
        
        try {
            HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
            int count = 0;
            int picoCount = 0;
            
            Log.d(TAG, "Scanning USB devices, total raw devices: " + deviceList.size());
            
            for (UsbDevice device : deviceList.values()) {
                JSObject deviceInfo = createDeviceInfo(device);
                devices.put(String.valueOf(device.getDeviceId()), deviceInfo);
                count++;
                
                Log.d(TAG, "  Device found: VID=0x" + Integer.toHexString(device.getVendorId()) + 
                      " (" + device.getVendorId() + ") PID=0x" + Integer.toHexString(device.getProductId()) +
                      " (" + device.getProductId() + ") Name=" + device.getDeviceName());
                
                if (device.getVendorId() == PICO_VENDOR_ID) {
                    picoCount++;
                    Log.d(TAG, "    -> This is a Raspberry Pi Pico!");
                }
            }
            
            result.put("success", true);
            result.put("devices", devices);
            result.put("count", count);
            result.put("picoCount", picoCount);
            
            Log.d(TAG, "Found " + count + " USB devices, " + picoCount + " Pico devices");
        } catch (Exception e) {
            Log.e(TAG, "Error getting devices", e);
            result.put("success", false);
            result.put("devices", new JSObject());
            result.put("count", 0);
            result.put("error", e.getMessage());
        }
        
        call.resolve(result);
    }
    
    @PluginMethod
    public void requestDevice(PluginCall call) {
        int targetVendorId = call.getInt("vendorId", PICO_VENDOR_ID);
        
        Log.d(TAG, "requestDevice called with vendorId: " + targetVendorId);
        
        HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
        UsbDevice targetDevice = null;
        
        // First try to find Pico specifically
        for (UsbDevice device : deviceList.values()) {
            if (device.getVendorId() == PICO_VENDOR_ID) {
                targetDevice = device;
                Log.d(TAG, "Found Pico device: " + device.getDeviceName());
                break;
            }
        }
        
        // If no Pico found, try the target vendor ID
        if (targetDevice == null && targetVendorId != PICO_VENDOR_ID) {
            for (UsbDevice device : deviceList.values()) {
                if (device.getVendorId() == targetVendorId) {
                    targetDevice = device;
                    break;
                }
            }
        }
        
        // If still nothing, take the first available device
        if (targetDevice == null && !deviceList.isEmpty()) {
            targetDevice = deviceList.values().iterator().next();
            Log.d(TAG, "Using first available device: " + targetDevice.getDeviceName());
        }
        
        if (targetDevice == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "No USB device found. Make sure your Pico is connected via OTG cable.");
            call.resolve(result);
            return;
        }
        
        if (usbManager.hasPermission(targetDevice)) {
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("device", createDeviceInfo(targetDevice));
            call.resolve(result);
        } else {
            Log.d(TAG, "Requesting permission for device: " + targetDevice.getDeviceName());
            pendingPermissionCall = call;
            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
            PendingIntent permissionIntent = PendingIntent.getBroadcast(
                getContext(), 0, new Intent(ACTION_USB_PERMISSION), flags
            );
            usbManager.requestPermission(targetDevice, permissionIntent);
        }
    }
    
    @PluginMethod
    public void connect(PluginCall call) {
        int targetVendorId = call.getInt("vendorId", 0);
        int targetProductId = call.getInt("productId", 0);
        
        Log.d(TAG, "Connect called with vendorId: " + targetVendorId + ", productId: " + targetProductId);
        
        // First, try custom prober (for Pico and other CDC devices)
        List<UsbSerialDriver> customDrivers = customProber.findAllDrivers(usbManager);
        Log.d(TAG, "Custom prober found " + customDrivers.size() + " drivers");
        
        // Then try default prober
        List<UsbSerialDriver> defaultDrivers = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager);
        Log.d(TAG, "Default prober found " + defaultDrivers.size() + " drivers");
        
        // Combine both lists, preferring custom drivers
        java.util.ArrayList<UsbSerialDriver> allDrivers = new java.util.ArrayList<>();
        allDrivers.addAll(customDrivers);
        for (UsbSerialDriver driver : defaultDrivers) {
            boolean alreadyAdded = false;
            for (UsbSerialDriver existing : customDrivers) {
                if (existing.getDevice().getDeviceId() == driver.getDevice().getDeviceId()) {
                    alreadyAdded = true;
                    break;
                }
            }
            if (!alreadyAdded) {
                allDrivers.add(driver);
            }
        }
        
        Log.d(TAG, "Total drivers available: " + allDrivers.size());
        
        if (allDrivers.isEmpty()) {
            HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
            Log.d(TAG, "No drivers found. Raw devices: " + deviceList.size());
            StringBuilder deviceInfo = new StringBuilder();
            for (UsbDevice d : deviceList.values()) {
                deviceInfo.append("\n  VID=0x").append(Integer.toHexString(d.getVendorId()))
                         .append(" PID=0x").append(Integer.toHexString(d.getProductId()))
                         .append(" ").append(d.getDeviceName());
                Log.d(TAG, "  Device: VID=" + d.getVendorId() + " PID=" + d.getProductId() + " Name=" + d.getDeviceName());
            }
            
            JSObject result = new JSObject();
            result.put("success", false);
            if (deviceList.isEmpty()) {
                result.put("error", "No USB device connected. Connect your Pico wallet using an OTG adapter cable.");
            } else {
                result.put("error", "USB device found but not recognized as serial device. Make sure your Pico has the correct firmware installed." + deviceInfo);
            }
            call.resolve(result);
            return;
        }
        
        UsbSerialDriver selectedDriver = null;
        
        // Priority 1: Find Pico specifically
        for (UsbSerialDriver driver : allDrivers) {
            UsbDevice device = driver.getDevice();
            if (device.getVendorId() == PICO_VENDOR_ID) {
                selectedDriver = driver;
                Log.d(TAG, "Selected Pico driver: VID=" + device.getVendorId() + " PID=" + device.getProductId());
                break;
            }
        }
        
        // Priority 2: Match requested vendor/product ID
        if (selectedDriver == null && targetVendorId != 0) {
            for (UsbSerialDriver driver : allDrivers) {
                UsbDevice device = driver.getDevice();
                if (device.getVendorId() == targetVendorId) {
                    if (targetProductId == 0 || device.getProductId() == targetProductId) {
                        selectedDriver = driver;
                        Log.d(TAG, "Selected matching driver: VID=" + device.getVendorId() + " PID=" + device.getProductId());
                        break;
                    }
                }
            }
        }
        
        // Priority 3: Use first available
        if (selectedDriver == null) {
            selectedDriver = allDrivers.get(0);
            Log.d(TAG, "Using first available driver");
        }
        
        UsbDevice device = selectedDriver.getDevice();
        Log.d(TAG, "Final selected device: VID=" + device.getVendorId() + " PID=" + device.getProductId() + " Name=" + device.getDeviceName());
        
        if (!usbManager.hasPermission(device)) {
            Log.d(TAG, "Requesting USB permission for device");
            pendingPermissionCall = call;
            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
            PendingIntent permissionIntent = PendingIntent.getBroadcast(
                getContext(), 0, new Intent(ACTION_USB_PERMISSION), flags
            );
            usbManager.requestPermission(device, permissionIntent);
            return;
        }
        
        connectToDevice(device, call);
    }
    
    private void connectToDevice(UsbDevice device, PluginCall call) {
        try {
            Log.d(TAG, "connectToDevice: " + device.getDeviceName());
            
            // Try custom prober first
            List<UsbSerialDriver> drivers = customProber.findAllDrivers(usbManager);
            UsbSerialDriver driver = null;
            
            for (UsbSerialDriver d : drivers) {
                if (d.getDevice().getDeviceId() == device.getDeviceId()) {
                    driver = d;
                    break;
                }
            }
            
            // Fall back to default prober
            if (driver == null) {
                drivers = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager);
                for (UsbSerialDriver d : drivers) {
                    if (d.getDevice().getDeviceId() == device.getDeviceId()) {
                        driver = d;
                        break;
                    }
                }
            }
            
            if (driver == null) {
                // Last resort: create CDC driver directly for Pico
                if (device.getVendorId() == PICO_VENDOR_ID) {
                    Log.d(TAG, "Creating CDC driver directly for Pico");
                    driver = new CdcAcmSerialDriver(device);
                }
            }
            
            if (driver == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "No compatible driver found for this device. VID=" + device.getVendorId() + " PID=" + device.getProductId());
                call.resolve(result);
                return;
            }
            
            connection = usbManager.openDevice(device);
            if (connection == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Could not open USB connection. Try unplugging and reconnecting your device.");
                call.resolve(result);
                return;
            }
            
            List<UsbSerialPort> ports = driver.getPorts();
            if (ports.isEmpty()) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "No serial ports found on device");
                call.resolve(result);
                return;
            }
            
            serialPort = ports.get(0);
            serialPort.open(connection);
            serialPort.setParameters(115200, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE);
            
            // Set DTR/RTS for proper communication with Pico
            try {
                serialPort.setDTR(true);
                serialPort.setRTS(true);
            } catch (Exception e) {
                Log.w(TAG, "Could not set DTR/RTS: " + e.getMessage());
            }
            
            // Start I/O manager for async reading
            ioManager = new SerialInputOutputManager(serialPort, this);
            Executors.newSingleThreadExecutor().submit(ioManager);
            
            Log.d(TAG, "Successfully connected to USB serial device: " + device.getDeviceName());
            
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("deviceName", device.getDeviceName());
            result.put("vendorId", device.getVendorId());
            result.put("productId", device.getProductId());
            result.put("isPico", device.getVendorId() == PICO_VENDOR_ID);
            call.resolve(result);
            
        } catch (Exception e) {
            Log.e(TAG, "Error connecting to device", e);
            
            // Clean up on failure
            if (connection != null) {
                connection.close();
                connection = null;
            }
            serialPort = null;
            
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Connection failed: " + e.getMessage());
            call.resolve(result);
        }
    }
    
    @PluginMethod
    public void disconnect(PluginCall call) {
        disconnect();
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }
    
    private void disconnect() {
        Log.d(TAG, "Disconnecting...");
        
        if (ioManager != null) {
            ioManager.setListener(null);
            ioManager.stop();
            ioManager = null;
        }
        
        if (serialPort != null) {
            try {
                serialPort.close();
            } catch (IOException e) {
                Log.e(TAG, "Error closing serial port", e);
            }
            serialPort = null;
        }
        
        if (connection != null) {
            connection.close();
            connection = null;
        }
        
        dataBuffer.setLength(0);
    }
    
    @PluginMethod
    public void write(PluginCall call) {
        String data = call.getString("data", "");
        
        if (serialPort == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Not connected to device");
            call.resolve(result);
            return;
        }
        
        try {
            byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
            serialPort.write(bytes, 2000);
            
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("bytesWritten", bytes.length);
            call.resolve(result);
            
            Log.d(TAG, "Wrote " + bytes.length + " bytes: " + data.trim());
        } catch (Exception e) {
            Log.e(TAG, "Error writing data", e);
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Write failed: " + e.getMessage());
            call.resolve(result);
        }
    }
    
    @PluginMethod
    public void read(PluginCall call) {
        int timeout = call.getInt("timeout", 1000);
        
        if (serialPort == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Not connected to device");
            call.resolve(result);
            return;
        }
        
        try {
            byte[] buffer = new byte[1024];
            int bytesRead = serialPort.read(buffer, timeout);
            
            JSObject result = new JSObject();
            if (bytesRead > 0) {
                String data = new String(buffer, 0, bytesRead, StandardCharsets.UTF_8);
                result.put("success", true);
                result.put("data", data);
                result.put("bytesRead", bytesRead);
                Log.d(TAG, "Read " + bytesRead + " bytes: " + data.trim());
            } else {
                result.put("success", true);
                result.put("data", "");
                result.put("bytesRead", 0);
            }
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error reading data", e);
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Read failed: " + e.getMessage());
            call.resolve(result);
        }
    }
    
    @PluginMethod
    public void isConnected(PluginCall call) {
        boolean connected = serialPort != null && connection != null;
        JSObject result = new JSObject();
        result.put("connected", connected);
        call.resolve(result);
    }
    
    @Override
    public void onNewData(byte[] data) {
        String str = new String(data, StandardCharsets.UTF_8);
        Log.d(TAG, "Received data: " + str.trim());
        JSObject eventData = new JSObject();
        eventData.put("data", str);
        notifyListeners("usbData", eventData);
    }
    
    @Override
    public void onRunError(Exception e) {
        Log.e(TAG, "Serial I/O error", e);
        disconnect();
        JSObject errorData = new JSObject();
        errorData.put("error", e.getMessage());
        notifyListeners("usbDisconnected", errorData);
    }
}
