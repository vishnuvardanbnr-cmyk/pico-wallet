package app.vaultkey.wallet.plugins;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

@CapacitorPlugin(name = "DAppBrowser")
public class DAppBrowserPlugin extends Plugin {
    private static final String TAG = "DAppBrowserPlugin";
    
    private WebView dappWebView;
    private ViewGroup browserContainer;
    private String currentAddress = "";
    private int currentChainId = 1;
    private boolean isOpen = false;
    
    private static final String WEB3_PROVIDER_JS = 
        "(function() {" +
        "  if (window.ethereum) return;" +
        "  console.log('[VaultKey] Injecting Web3 provider');" +
        "  " +
        "  const callbacks = new Map();" +
        "  let requestId = 0;" +
        "  " +
        "  window.ethereum = {" +
        "    isMetaMask: true," +
        "    isVaultKey: true," +
        "    chainId: '0x' + (%d).toString(16)," +
        "    networkVersion: '%d'," +
        "    selectedAddress: '%s'," +
        "    _address: '%s'," +
        "    " +
        "    isConnected: function() { return true; }," +
        "    " +
        "    request: async function(args) {" +
        "      const method = args.method;" +
        "      const params = args.params || [];" +
        "      console.log('[VaultKey] Request:', method, params);" +
        "      " +
        "      if (method === 'eth_accounts' || method === 'eth_requestAccounts') {" +
        "        return [this._address];" +
        "      }" +
        "      if (method === 'eth_chainId') {" +
        "        return this.chainId;" +
        "      }" +
        "      if (method === 'net_version') {" +
        "        return this.networkVersion;" +
        "      }" +
        "      if (method === 'wallet_switchEthereumChain') {" +
        "        return this._sendToNative(method, params);" +
        "      }" +
        "      if (method === 'eth_sendTransaction' || method === 'eth_signTransaction' ||" +
        "          method === 'personal_sign' || method === 'eth_sign' ||" +
        "          method.includes('signTypedData')) {" +
        "        return this._sendToNative(method, params);" +
        "      }" +
        "      " +
        "      return this._rpcCall(method, params);" +
        "    }," +
        "    " +
        "    _sendToNative: function(method, params) {" +
        "      return new Promise((resolve, reject) => {" +
        "        const id = ++requestId;" +
        "        callbacks.set(id, { resolve, reject });" +
        "        window.VaultKeyBridge.postMessage(JSON.stringify({ id, method, params }));" +
        "      });" +
        "    }," +
        "    " +
        "    _rpcCall: async function(method, params) {" +
        "      const rpcUrl = this._getRpcUrl();" +
        "      const response = await fetch(rpcUrl, {" +
        "        method: 'POST'," +
        "        headers: { 'Content-Type': 'application/json' }," +
        "        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })" +
        "      });" +
        "      const data = await response.json();" +
        "      if (data.error) throw new Error(data.error.message);" +
        "      return data.result;" +
        "    }," +
        "    " +
        "    _getRpcUrl: function() {" +
        "      const chainId = parseInt(this.chainId, 16);" +
        "      const urls = {" +
        "        1: 'https://eth.llamarpc.com'," +
        "        56: 'https://bsc-dataseed.binance.org'," +
        "        137: 'https://polygon-rpc.com'," +
        "        42161: 'https://arb1.arbitrum.io/rpc'," +
        "        10: 'https://mainnet.optimism.io'," +
        "        43114: 'https://api.avax.network/ext/bc/C/rpc'," +
        "        250: 'https://rpc.ftm.tools'" +
        "      };" +
        "      return urls[chainId] || urls[1];" +
        "    }," +
        "    " +
        "    _handleResponse: function(id, result, error) {" +
        "      const cb = callbacks.get(id);" +
        "      if (cb) {" +
        "        callbacks.delete(id);" +
        "        if (error) cb.reject(new Error(error));" +
        "        else cb.resolve(result);" +
        "      }" +
        "    }," +
        "    " +
        "    on: function(event, handler) {" +
        "      if (!this._events) this._events = {};" +
        "      if (!this._events[event]) this._events[event] = [];" +
        "      this._events[event].push(handler);" +
        "    }," +
        "    " +
        "    removeListener: function(event, handler) {" +
        "      if (this._events && this._events[event]) {" +
        "        this._events[event] = this._events[event].filter(h => h !== handler);" +
        "      }" +
        "    }," +
        "    " +
        "    emit: function(event, data) {" +
        "      if (this._events && this._events[event]) {" +
        "        this._events[event].forEach(h => h(data));" +
        "      }" +
        "    }," +
        "    " +
        "    enable: async function() { return [this._address]; }," +
        "    send: function(method, params) {" +
        "      if (typeof method === 'string') {" +
        "        return this.request({ method, params });" +
        "      }" +
        "      return this.request(method);" +
        "    }," +
        "    sendAsync: function(payload, callback) {" +
        "      this.request(payload).then(" +
        "        result => callback(null, { jsonrpc: '2.0', id: payload.id, result })," +
        "        error => callback(error, null)" +
        "      );" +
        "    }" +
        "  };" +
        "  " +
        "  window.web3 = { currentProvider: window.ethereum };" +
        "  " +
        "  window.dispatchEvent(new Event('ethereum#initialized'));" +
        "  console.log('[VaultKey] Web3 provider injected successfully');" +
        "})();";
    
    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url", "");
        currentAddress = call.getString("address", "");
        currentChainId = call.getInt("chainId", 1);
        
        Log.d(TAG, "Opening DApp browser: " + url + " with address: " + currentAddress);
        
        if (url.isEmpty()) {
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", "URL is required");
            call.resolve(result);
            return;
        }
        
        getActivity().runOnUiThread(() -> {
            try {
                createBrowserView(url);
                isOpen = true;
                
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "Error opening browser", e);
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", e.getMessage());
                call.resolve(result);
            }
        });
    }
    
    private void createBrowserView(String url) {
        Activity activity = getActivity();
        
        browserContainer = new FrameLayout(activity);
        browserContainer.setBackgroundColor(Color.WHITE);
        browserContainer.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        
        LinearLayout toolbar = new LinearLayout(activity);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setBackgroundColor(Color.parseColor("#1a1a2e"));
        toolbar.setPadding(16, 48, 16, 16);
        
        ImageButton closeBtn = new ImageButton(activity);
        closeBtn.setBackgroundColor(Color.TRANSPARENT);
        closeBtn.setColorFilter(Color.WHITE);
        closeBtn.setContentDescription("Close");
        closeBtn.setOnClickListener(v -> closeBrowser());
        
        TextView urlText = new TextView(activity);
        urlText.setText(url);
        urlText.setTextColor(Color.WHITE);
        urlText.setSingleLine(true);
        urlText.setPadding(16, 0, 16, 0);
        LinearLayout.LayoutParams urlParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        urlText.setLayoutParams(urlParams);
        
        toolbar.addView(closeBtn);
        toolbar.addView(urlText);
        
        ProgressBar progressBar = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setIndeterminate(false);
        progressBar.setMax(100);
        progressBar.setVisibility(View.GONE);
        
        dappWebView = new WebView(activity);
        dappWebView.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        
        WebSettings settings = dappWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " VaultKey/1.0");
        
        dappWebView.addJavascriptInterface(new WebAppInterface(), "VaultKeyBridge");
        
        dappWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
                urlText.setText(url);
                
                JSObject event = new JSObject();
                event.put("url", url);
                event.put("loading", true);
                notifyListeners("browserEvent", event);
            }
            
            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                injectWeb3Provider();
                
                JSObject event = new JSObject();
                event.put("url", url);
                event.put("loading", false);
                notifyListeners("browserEvent", event);
            }
            
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String requestUrl = request.getUrl().toString();
                if (requestUrl.startsWith("http://") || requestUrl.startsWith("https://")) {
                    return false;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(requestUrl));
                    activity.startActivity(intent);
                } catch (Exception e) {
                    Log.e(TAG, "Cannot handle URL: " + requestUrl);
                }
                return true;
            }
        });
        
        dappWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
            }
            
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d(TAG, "Console: " + consoleMessage.message());
                return true;
            }
        });
        
        LinearLayout mainLayout = new LinearLayout(activity);
        mainLayout.setOrientation(LinearLayout.VERTICAL);
        mainLayout.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        
        mainLayout.addView(toolbar);
        mainLayout.addView(progressBar);
        mainLayout.addView(dappWebView);
        
        browserContainer.addView(mainLayout);
        
        ViewGroup rootView = activity.findViewById(android.R.id.content);
        rootView.addView(browserContainer);
        
        dappWebView.loadUrl(url);
    }
    
    private void injectWeb3Provider() {
        if (dappWebView == null) return;
        
        String js = String.format(WEB3_PROVIDER_JS, currentChainId, currentChainId, currentAddress, currentAddress);
        dappWebView.evaluateJavascript(js, null);
    }
    
    private void closeBrowser() {
        getActivity().runOnUiThread(() -> {
            if (browserContainer != null) {
                ViewGroup rootView = getActivity().findViewById(android.R.id.content);
                rootView.removeView(browserContainer);
                browserContainer = null;
            }
            
            if (dappWebView != null) {
                dappWebView.destroy();
                dappWebView = null;
            }
            
            isOpen = false;
        });
    }
    
    @PluginMethod
    public void close(PluginCall call) {
        closeBrowser();
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }
    
    @PluginMethod
    public void updateAccount(PluginCall call) {
        currentAddress = call.getString("address", currentAddress);
        currentChainId = call.getInt("chainId", currentChainId);
        
        if (dappWebView != null) {
            getActivity().runOnUiThread(() -> {
                String js = String.format(
                    "if(window.ethereum) {" +
                    "  window.ethereum._address = '%s';" +
                    "  window.ethereum.selectedAddress = '%s';" +
                    "  window.ethereum.chainId = '0x%x';" +
                    "  window.ethereum.networkVersion = '%d';" +
                    "  window.ethereum.emit('accountsChanged', ['%s']);" +
                    "  window.ethereum.emit('chainChanged', '0x%x');" +
                    "}",
                    currentAddress, currentAddress, currentChainId, currentChainId, currentAddress, currentChainId
                );
                dappWebView.evaluateJavascript(js, null);
            });
        }
        
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }
    
    @PluginMethod
    public void sendResponse(PluginCall call) {
        int id = call.getInt("id", 0);
        String resultStr = call.getString("result", null);
        String error = call.getString("error", null);
        
        if (dappWebView != null) {
            getActivity().runOnUiThread(() -> {
                String js;
                if (error != null) {
                    js = String.format("window.ethereum._handleResponse(%d, null, '%s');", id, error.replace("'", "\\'"));
                } else {
                    js = String.format("window.ethereum._handleResponse(%d, %s, null);", id, resultStr != null ? resultStr : "null");
                }
                dappWebView.evaluateJavascript(js, null);
            });
        }
        
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }
    
    @PluginMethod
    public void resumeBrowser(PluginCall call) {
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }
    
    @PluginMethod
    public void requestPin(PluginCall call) {
        String walletGroupId = call.getString("walletGroupId", "");
        
        getActivity().runOnUiThread(() -> {
            AlertDialog.Builder builder = new AlertDialog.Builder(getActivity());
            builder.setTitle("Enter PIN");
            
            final EditText input = new EditText(getActivity());
            input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
            input.setHint("Enter your PIN");
            builder.setView(input);
            
            builder.setPositiveButton("Confirm", (dialog, which) -> {
                String pin = input.getText().toString();
                JSObject event = new JSObject();
                event.put("pin", pin);
                event.put("walletGroupId", walletGroupId);
                event.put("cancelled", false);
                notifyListeners("pinResponse", event);
            });
            
            builder.setNegativeButton("Cancel", (dialog, which) -> {
                dialog.cancel();
                JSObject event = new JSObject();
                event.put("pin", "");
                event.put("walletGroupId", walletGroupId);
                event.put("cancelled", true);
                notifyListeners("pinResponse", event);
            });
            
            AlertDialog dialog = builder.create();
            dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
            dialog.show();
        });
        
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }
    
    private class WebAppInterface {
        @JavascriptInterface
        public void postMessage(String message) {
            try {
                JSONObject json = new JSONObject(message);
                int id = json.getInt("id");
                String method = json.getString("method");
                String params = json.optString("params", "[]");
                
                Log.d(TAG, "Web3 request: " + method + " id: " + id);
                
                JSObject event = new JSObject();
                event.put("id", id);
                event.put("method", method);
                event.put("params", params);
                event.put("confirmed", false);
                
                if (method.equals("eth_sendTransaction") || method.equals("eth_signTransaction") ||
                    method.equals("personal_sign") || method.equals("eth_sign") ||
                    method.contains("signTypedData")) {
                    
                    getActivity().runOnUiThread(() -> {
                        showSignConfirmation(id, method, params);
                    });
                } else {
                    notifyListeners("web3Request", event);
                }
                
            } catch (Exception e) {
                Log.e(TAG, "Error parsing web3 request", e);
            }
        }
    }
    
    private void showSignConfirmation(int id, String method, String params) {
        AlertDialog.Builder builder = new AlertDialog.Builder(getActivity());
        
        String title = "Sign Request";
        String message = "A DApp is requesting to sign:\n\n" + method;
        
        if (method.contains("Transaction")) {
            title = "Confirm Transaction";
            message = "A DApp wants to send a transaction.\nReview carefully before signing.";
        } else if (method.contains("sign")) {
            title = "Sign Message";
            message = "A DApp wants to sign a message.\nMake sure you trust this site.";
        }
        
        builder.setTitle(title);
        builder.setMessage(message);
        
        builder.setPositiveButton("Confirm", (dialog, which) -> {
            JSObject event = new JSObject();
            event.put("id", id);
            event.put("method", method);
            event.put("params", params);
            event.put("confirmed", true);
            notifyListeners("web3Request", event);
        });
        
        builder.setNegativeButton("Reject", (dialog, which) -> {
            sendErrorResponse(id, "User rejected");
        });
        
        builder.setCancelable(false);
        builder.show();
    }
    
    private void sendErrorResponse(int id, String error) {
        if (dappWebView != null) {
            getActivity().runOnUiThread(() -> {
                String js = String.format("window.ethereum._handleResponse(%d, null, '%s');", id, error);
                dappWebView.evaluateJavascript(js, null);
            });
        }
    }
}
