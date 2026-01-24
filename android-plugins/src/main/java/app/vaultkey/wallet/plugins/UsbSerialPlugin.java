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
    
    private UsbManager usbManager;
    private UsbSerialPort serialPort;
    private UsbDeviceConnection connection;
    private SerialInputOutputManager ioManager;
    private StringBuilder dataBuffer = new StringBuilder();
    private PluginCall pendingPermissionCall;
    
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
                            result.put("error", "USB permission denied");
                            pendingPermissionCall.resolve(result);
                            pendingPermissionCall = null;
                        }
                    }
                }
            } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) {
                UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                if (device != null) {
                    JSObject deviceInfo = createDeviceInfo(device);
                    JSObject eventData = new JSObject();
                    eventData.put("device", deviceInfo);
                    notifyListeners("usbAttached", eventData);
                    Log.d(TAG, "USB device attached: " + device.getDeviceName());
                }
            } else if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                if (device != null) {
                    disconnect();
                    notifyListeners("usbDisconnected", new JSObject());
                    Log.d(TAG, "USB device detached: " + device.getDeviceName());
                }
            }
        }
    };
    
    @Override
    public void load() {
        usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_USB_PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(usbReceiver, filter);
        }
        
        Log.d(TAG, "UsbSerialPlugin loaded");
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
        return info;
    }
    
    @PluginMethod
    public void getDevices(PluginCall call) {
        JSObject result = new JSObject();
        JSObject devices = new JSObject();
        
        try {
            HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
            int count = 0;
            
            for (UsbDevice device : deviceList.values()) {
                devices.put(String.valueOf(device.getDeviceId()), createDeviceInfo(device));
                count++;
            }
            
            result.put("success", true);
            result.put("devices", devices);
            result.put("count", count);
            
            Log.d(TAG, "Found " + count + " USB devices");
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
        int targetVendorId = call.getInt("vendorId", 0);
        
        HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
        UsbDevice targetDevice = null;
        
        for (UsbDevice device : deviceList.values()) {
            if (targetVendorId == 0 || device.getVendorId() == targetVendorId) {
                targetDevice = device;
                break;
            }
        }
        
        if (targetDevice == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "No matching device found");
            call.resolve(result);
            return;
        }
        
        if (usbManager.hasPermission(targetDevice)) {
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("device", createDeviceInfo(targetDevice));
            call.resolve(result);
        } else {
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
        
        List<UsbSerialDriver> availableDrivers = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager);
        
        if (availableDrivers.isEmpty()) {
            HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
            Log.d(TAG, "No drivers found. Raw devices: " + deviceList.size());
            for (UsbDevice d : deviceList.values()) {
                Log.d(TAG, "  Device: VID=" + d.getVendorId() + " PID=" + d.getProductId() + " Name=" + d.getDeviceName());
            }
            
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "No USB serial devices found. Make sure the device is connected via OTG cable.");
            call.resolve(result);
            return;
        }
        
        UsbSerialDriver selectedDriver = null;
        
        for (UsbSerialDriver driver : availableDrivers) {
            UsbDevice device = driver.getDevice();
            Log.d(TAG, "Found driver for device: VID=" + device.getVendorId() + " PID=" + device.getProductId());
            
            if (targetVendorId == 0) {
                selectedDriver = driver;
                break;
            }
            
            if (device.getVendorId() == targetVendorId) {
                if (targetProductId == 0 || device.getProductId() == targetProductId) {
                    selectedDriver = driver;
                    break;
                }
            }
        }
        
        if (selectedDriver == null) {
            selectedDriver = availableDrivers.get(0);
            Log.d(TAG, "Using first available driver");
        }
        
        UsbDevice device = selectedDriver.getDevice();
        
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
            List<UsbSerialDriver> drivers = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager);
            UsbSerialDriver driver = null;
            
            for (UsbSerialDriver d : drivers) {
                if (d.getDevice().getDeviceId() == device.getDeviceId()) {
                    driver = d;
                    break;
                }
            }
            
            if (driver == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "No driver found for device");
                call.resolve(result);
                return;
            }
            
            connection = usbManager.openDevice(device);
            if (connection == null) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Could not open device connection");
                call.resolve(result);
                return;
            }
            
            serialPort = driver.getPorts().get(0);
            serialPort.open(connection);
            serialPort.setParameters(115200, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE);
            serialPort.setDTR(true);
            serialPort.setRTS(true);
            
            ioManager = new SerialInputOutputManager(serialPort, this);
            Executors.newSingleThreadExecutor().submit(ioManager);
            
            Log.d(TAG, "Successfully connected to USB serial device");
            
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("deviceName", device.getDeviceName());
            call.resolve(result);
            
        } catch (Exception e) {
            Log.e(TAG, "Error connecting to device", e);
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
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
            result.put("error", "Not connected");
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
            
            Log.d(TAG, "Wrote " + bytes.length + " bytes");
        } catch (Exception e) {
            Log.e(TAG, "Error writing data", e);
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }
    
    @PluginMethod
    public void read(PluginCall call) {
        int timeout = call.getInt("timeout", 1000);
        
        if (serialPort == null) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "Not connected");
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
            result.put("error", e.getMessage());
            call.resolve(result);
        }
    }
    
    @PluginMethod
    public void isConnected(PluginCall call) {
        JSObject result = new JSObject();
        result.put("connected", serialPort != null && connection != null);
        call.resolve(result);
    }
    
    @Override
    public void onNewData(byte[] data) {
        String str = new String(data, StandardCharsets.UTF_8);
        JSObject eventData = new JSObject();
        eventData.put("data", str);
        notifyListeners("usbData", eventData);
    }
    
    @Override
    public void onRunError(Exception e) {
        Log.e(TAG, "Serial I/O error", e);
        disconnect();
        notifyListeners("usbDisconnected", new JSObject());
    }
}
