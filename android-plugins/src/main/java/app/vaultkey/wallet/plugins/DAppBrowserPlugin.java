package app.vaultkey.wallet.plugins;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.Log;
import android.view.Gravity;
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

import org.json.JSONArray;
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
        "  if (window.ethereum && window.ethereum.isVaultKey) {" +
        "    console.log('[VaultKey] Provider already injected');" +
        "    return;" +
        "  }" +
        "  console.log('[VaultKey] Injecting Web3 provider...');" +
        "  " +
        "  const callbacks = new Map();" +
        "  let requestId = 0;" +
        "  " +
        "  const provider = {" +
        "    isMetaMask: true," +
        "    isVaultKey: true," +
        "    _chainId: %d," +
        "    _address: '%s'," +
        "    _events: {}," +
        "    " +
        "    get chainId() { return '0x' + this._chainId.toString(16); }," +
        "    get networkVersion() { return String(this._chainId); }," +
        "    get selectedAddress() { return this._address || null; }," +
        "    " +
        "    isConnected: function() { return true; }," +
        "    " +
        "    request: async function(args) {" +
        "      const method = args.method;" +
        "      const params = args.params || [];" +
        "      console.log('[VaultKey] Request:', method, JSON.stringify(params));" +
        "      " +
        "      try {" +
        "        if (method === 'eth_accounts' || method === 'eth_requestAccounts') {" +
        "          return this._address ? [this._address] : [];" +
        "        }" +
        "        if (method === 'eth_chainId') {" +
        "          return this.chainId;" +
        "        }" +
        "        if (method === 'net_version') {" +
        "          return this.networkVersion;" +
        "        }" +
        "        if (method === 'wallet_switchEthereumChain' || " +
        "            method === 'eth_sendTransaction' || method === 'eth_signTransaction' ||" +
        "            method === 'personal_sign' || method === 'eth_sign' ||" +
        "            method.includes('signTypedData')) {" +
        "          return await this._sendToNative(method, params);" +
        "        }" +
        "        return await this._rpcCall(method, params);" +
        "      } catch (e) {" +
        "        console.error('[VaultKey] Request error:', e);" +
        "        throw e;" +
        "      }" +
        "    }," +
        "    " +
        "    _sendToNative: function(method, params) {" +
        "      return new Promise((resolve, reject) => {" +
        "        const id = ++requestId;" +
        "        callbacks.set(id, { resolve, reject, method });" +
        "        console.log('[VaultKey] Sending to native, id:', id, 'method:', method);" +
        "        try {" +
        "          window.VaultKeyBridge.postMessage(JSON.stringify({ id: id, method: method, params: params }));" +
        "        } catch (e) {" +
        "          callbacks.delete(id);" +
        "          reject(new Error('Failed to communicate with wallet: ' + e.message));" +
        "        }" +
        "      });" +
        "    }," +
        "    " +
        "    _rpcCall: async function(method, params) {" +
        "      const rpcUrl = this._getRpcUrl();" +
        "      console.log('[VaultKey] RPC call:', method, 'to:', rpcUrl);" +
        "      const response = await fetch(rpcUrl, {" +
        "        method: 'POST'," +
        "        headers: { 'Content-Type': 'application/json' }," +
        "        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: method, params: params })" +
        "      });" +
        "      const data = await response.json();" +
        "      if (data.error) {" +
        "        throw new Error(data.error.message || 'RPC Error');" +
        "      }" +
        "      return data.result;" +
        "    }," +
        "    " +
        "    _getRpcUrl: function() {" +
        "      const urls = {" +
        "        1: 'https://eth.llamarpc.com'," +
        "        56: 'https://bsc-dataseed.binance.org'," +
        "        137: 'https://polygon-rpc.com'," +
        "        42161: 'https://arb1.arbitrum.io/rpc'," +
        "        10: 'https://mainnet.optimism.io'," +
        "        43114: 'https://api.avax.network/ext/bc/C/rpc'," +
        "        250: 'https://rpc.ftm.tools'," +
        "        8453: 'https://mainnet.base.org'" +
        "      };" +
        "      return urls[this._chainId] || urls[1];" +
        "    }," +
        "    " +
        "    _handleResponse: function(id, result, error) {" +
        "      console.log('[VaultKey] Handling response, id:', id, 'result:', result, 'error:', error);" +
        "      const cb = callbacks.get(id);" +
        "      if (cb) {" +
        "        callbacks.delete(id);" +
        "        if (error) {" +
        "          cb.reject(new Error(error));" +
        "        } else {" +
        "          cb.resolve(result);" +
        "        }" +
        "      } else {" +
        "        console.warn('[VaultKey] No callback found for id:', id);" +
        "      }" +
        "    }," +
        "    " +
        "    on: function(event, handler) {" +
        "      if (!this._events[event]) this._events[event] = [];" +
        "      this._events[event].push(handler);" +
        "      return this;" +
        "    }," +
        "    " +
        "    removeListener: function(event, handler) {" +
        "      if (this._events[event]) {" +
        "        this._events[event] = this._events[event].filter(function(h) { return h !== handler; });" +
        "      }" +
        "      return this;" +
        "    }," +
        "    " +
        "    removeAllListeners: function(event) {" +
        "      if (event) {" +
        "        this._events[event] = [];" +
        "      } else {" +
        "        this._events = {};" +
        "      }" +
        "      return this;" +
        "    }," +
        "    " +
        "    emit: function(event, data) {" +
        "      console.log('[VaultKey] Emitting event:', event);" +
        "      if (this._events[event]) {" +
        "        this._events[event].forEach(function(h) { " +
        "          try { h(data); } catch(e) { console.error('[VaultKey] Event handler error:', e); }" +
        "        });" +
        "      }" +
        "      return true;" +
        "    }," +
        "    " +
        "    enable: async function() { return this._address ? [this._address] : []; }," +
        "    " +
        "    send: function(methodOrPayload, paramsOrCallback) {" +
        "      if (typeof methodOrPayload === 'string') {" +
        "        return this.request({ method: methodOrPayload, params: paramsOrCallback || [] });" +
        "      }" +
        "      return this.request(methodOrPayload);" +
        "    }," +
        "    " +
        "    sendAsync: function(payload, callback) {" +
        "      this.request({ method: payload.method, params: payload.params }).then(" +
        "        function(result) { callback(null, { jsonrpc: '2.0', id: payload.id, result: result }); }," +
        "        function(error) { callback(error, null); }" +
        "      );" +
        "    }" +
        "  };" +
        "  " +
        "  window.ethereum = provider;" +
        "  window.web3 = { currentProvider: provider };" +
        "  " +
        "  setTimeout(function() {" +
        "    window.dispatchEvent(new Event('ethereum#initialized'));" +
        "    document.dispatchEvent(new Event('ethereum#initialized'));" +
        "  }, 100);" +
        "  " +
        "  console.log('[VaultKey] Web3 provider injected successfully, address:', provider._address);" +
        "})();";
    
    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url", "");
        currentAddress = call.getString("address", "");
        currentChainId = call.getInt("chainId", 1);
        
        Log.d(TAG, "Opening DApp browser: " + url + " with address: " + currentAddress + " chainId: " + currentChainId);
        
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
        toolbar.setPadding(24, 60, 24, 20);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        
        ImageButton closeBtn = new ImageButton(activity);
        closeBtn.setBackgroundColor(Color.TRANSPARENT);
        GradientDrawable closeBtnBg = new GradientDrawable();
        closeBtnBg.setShape(GradientDrawable.OVAL);
        closeBtnBg.setColor(Color.parseColor("#333355"));
        closeBtn.setBackground(closeBtnBg);
        closeBtn.setPadding(16, 16, 16, 16);
        closeBtn.setContentDescription("Close");
        LinearLayout.LayoutParams closeBtnParams = new LinearLayout.LayoutParams(80, 80);
        closeBtn.setLayoutParams(closeBtnParams);
        closeBtn.setOnClickListener(v -> closeBrowser());
        
        TextView closeTxt = new TextView(activity);
        closeTxt.setText("✕");
        closeTxt.setTextColor(Color.WHITE);
        closeTxt.setTextSize(18);
        closeTxt.setGravity(Gravity.CENTER);
        
        TextView urlText = new TextView(activity);
        urlText.setTextColor(Color.parseColor("#cccccc"));
        urlText.setSingleLine(true);
        urlText.setTextSize(13);
        urlText.setPadding(24, 0, 24, 0);
        LinearLayout.LayoutParams urlParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        urlText.setLayoutParams(urlParams);
        
        try {
            Uri uri = Uri.parse(url);
            urlText.setText(uri.getHost() != null ? uri.getHost() : url);
        } catch (Exception e) {
            urlText.setText(url);
        }
        
        TextView walletIndicator = new TextView(activity);
        walletIndicator.setText("🔗");
        walletIndicator.setTextSize(16);
        walletIndicator.setPadding(16, 0, 0, 0);
        
        toolbar.addView(closeTxt);
        toolbar.addView(urlText);
        toolbar.addView(walletIndicator);
        
        ProgressBar progressBar = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setIndeterminate(false);
        progressBar.setMax(100);
        progressBar.setVisibility(View.GONE);
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 6
        );
        progressBar.setLayoutParams(progressParams);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            progressBar.setProgressTintList(android.content.res.ColorStateList.valueOf(Color.parseColor("#4ade80")));
        }
        
        dappWebView = new WebView(activity);
        LinearLayout.LayoutParams webViewParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1
        );
        dappWebView.setLayoutParams(webViewParams);
        
        WebSettings settings = dappWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setUserAgentString(settings.getUserAgentString().replace("; wv", "") + " VaultKey/1.0");
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        
        dappWebView.addJavascriptInterface(new WebAppInterface(), "VaultKeyBridge");
        
        dappWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String pageUrl, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
                progressBar.setProgress(10);
                
                try {
                    Uri uri = Uri.parse(pageUrl);
                    urlText.setText(uri.getHost() != null ? uri.getHost() : pageUrl);
                } catch (Exception e) {
                    urlText.setText(pageUrl);
                }
                
                JSObject event = new JSObject();
                event.put("url", pageUrl);
                event.put("loading", true);
                notifyListeners("browserEvent", event);
            }
            
            @Override
            public void onPageFinished(WebView view, String pageUrl) {
                progressBar.setVisibility(View.GONE);
                
                injectWeb3Provider();
                
                JSObject event = new JSObject();
                event.put("url", pageUrl);
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
            
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Log.e(TAG, "WebView error: " + description + " for URL: " + failingUrl);
            }
        });
        
        dappWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                if (newProgress >= 100) {
                    progressBar.setVisibility(View.GONE);
                }
            }
            
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                String level = consoleMessage.messageLevel().toString();
                Log.d(TAG, "[WebView " + level + "] " + consoleMessage.message() + 
                      " (line " + consoleMessage.lineNumber() + ")");
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
        browserContainer.setOnClickListener(v -> {});
        
        ViewGroup rootView = activity.findViewById(android.R.id.content);
        rootView.addView(browserContainer);
        
        dappWebView.loadUrl(url);
    }
    
    private void injectWeb3Provider() {
        if (dappWebView == null) return;
        
        String js = String.format(WEB3_PROVIDER_JS, currentChainId, currentAddress);
        Log.d(TAG, "Injecting Web3 provider with chainId: " + currentChainId + ", address: " + currentAddress);
        dappWebView.evaluateJavascript(js, result -> {
            Log.d(TAG, "Web3 provider injection result: " + result);
        });
    }
    
    private void closeBrowser() {
        Log.d(TAG, "Closing browser");
        getActivity().runOnUiThread(() -> {
            if (browserContainer != null) {
                ViewGroup rootView = getActivity().findViewById(android.R.id.content);
                rootView.removeView(browserContainer);
                browserContainer = null;
            }
            
            if (dappWebView != null) {
                dappWebView.stopLoading();
                dappWebView.destroy();
                dappWebView = null;
            }
            
            isOpen = false;
            
            JSObject event = new JSObject();
            event.put("closed", true);
            notifyListeners("browserEvent", event);
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
        String newAddress = call.getString("address", currentAddress);
        int newChainId = call.getInt("chainId", currentChainId);
        
        boolean addressChanged = !newAddress.equals(currentAddress);
        boolean chainChanged = newChainId != currentChainId;
        
        currentAddress = newAddress;
        currentChainId = newChainId;
        
        Log.d(TAG, "Updating account - address: " + currentAddress + ", chainId: " + currentChainId);
        
        if (dappWebView != null) {
            getActivity().runOnUiThread(() -> {
                StringBuilder js = new StringBuilder();
                js.append("if(window.ethereum && window.ethereum.isVaultKey) {");
                js.append("  window.ethereum._address = '").append(currentAddress).append("';");
                js.append("  window.ethereum._chainId = ").append(currentChainId).append(";");
                
                if (addressChanged) {
                    js.append("  window.ethereum.emit('accountsChanged', ['").append(currentAddress).append("']);");
                }
                if (chainChanged) {
                    js.append("  window.ethereum.emit('chainChanged', '0x").append(Integer.toHexString(currentChainId)).append("');");
                }
                
                js.append("  console.log('[VaultKey] Account updated');");
                js.append("}");
                
                dappWebView.evaluateJavascript(js.toString(), null);
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
        
        Log.d(TAG, "sendResponse called - id: " + id + ", result: " + resultStr + ", error: " + error);
        
        if (dappWebView != null && id > 0) {
            getActivity().runOnUiThread(() -> {
                String js;
                if (error != null) {
                    String escapedError = error.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n");
                    js = String.format("if(window.ethereum) window.ethereum._handleResponse(%d, null, '%s');", id, escapedError);
                } else if (resultStr != null) {
                    js = String.format("if(window.ethereum) window.ethereum._handleResponse(%d, %s, null);", id, resultStr);
                } else {
                    js = String.format("if(window.ethereum) window.ethereum._handleResponse(%d, null, null);", id);
                }
                
                Log.d(TAG, "Executing JS: " + js);
                dappWebView.evaluateJavascript(js, result -> {
                    Log.d(TAG, "Response JS result: " + result);
                });
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
        
        Log.d(TAG, "Requesting PIN for wallet group: " + walletGroupId);
        
        getActivity().runOnUiThread(() -> {
            AlertDialog.Builder builder = new AlertDialog.Builder(getActivity());
            builder.setTitle("Enter PIN to Sign");
            builder.setMessage("Enter your wallet PIN to authorize this transaction");
            
            final EditText input = new EditText(getActivity());
            input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
            input.setHint("Enter PIN");
            input.setPadding(48, 32, 48, 32);
            builder.setView(input);
            
            builder.setPositiveButton("Confirm", (dialog, which) -> {
                String pin = input.getText().toString();
                Log.d(TAG, "PIN entered, length: " + pin.length());
                JSObject event = new JSObject();
                event.put("pin", pin);
                event.put("walletGroupId", walletGroupId);
                event.put("cancelled", false);
                notifyListeners("pinResponse", event);
            });
            
            builder.setNegativeButton("Cancel", (dialog, which) -> {
                dialog.cancel();
                Log.d(TAG, "PIN entry cancelled");
                JSObject event = new JSObject();
                event.put("pin", "");
                event.put("walletGroupId", walletGroupId);
                event.put("cancelled", true);
                notifyListeners("pinResponse", event);
            });
            
            builder.setOnCancelListener(dialog -> {
                JSObject event = new JSObject();
                event.put("pin", "");
                event.put("walletGroupId", walletGroupId);
                event.put("cancelled", true);
                notifyListeners("pinResponse", event);
            });
            
            AlertDialog dialog = builder.create();
            if (dialog.getWindow() != null) {
                dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
            }
            dialog.show();
        });
        
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }
    
    private class WebAppInterface {
        @JavascriptInterface
        public void postMessage(String message) {
            Log.d(TAG, "Received from WebView: " + message);
            try {
                JSONObject json = new JSONObject(message);
                int id = json.getInt("id");
                String method = json.getString("method");
                JSONArray paramsArray = json.optJSONArray("params");
                String params = paramsArray != null ? paramsArray.toString() : "[]";
                
                Log.d(TAG, "Web3 request - id: " + id + ", method: " + method);
                
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
                } else if (method.equals("wallet_switchEthereumChain")) {
                    event.put("confirmed", true);
                    notifyListeners("web3Request", event);
                } else {
                    notifyListeners("web3Request", event);
                }
                
            } catch (Exception e) {
                Log.e(TAG, "Error parsing web3 request: " + e.getMessage(), e);
            }
        }
    }
    
    private void showSignConfirmation(int id, String method, String params) {
        AlertDialog.Builder builder = new AlertDialog.Builder(getActivity());
        
        String title;
        String message;
        
        if (method.equals("eth_sendTransaction") || method.equals("eth_signTransaction")) {
            title = "Confirm Transaction";
            message = "A DApp wants to send a transaction.\n\nReview the details in your wallet and confirm.";
        } else if (method.equals("personal_sign") || method.equals("eth_sign")) {
            title = "Sign Message";
            message = "A DApp wants you to sign a message.\n\nMake sure you trust this website.";
        } else if (method.contains("signTypedData")) {
            title = "Sign Typed Data";
            message = "A DApp wants you to sign structured data.\n\nReview carefully before confirming.";
        } else {
            title = "Sign Request";
            message = "A DApp is requesting: " + method;
        }
        
        builder.setTitle(title);
        builder.setMessage(message);
        
        builder.setPositiveButton("Continue", (dialog, which) -> {
            Log.d(TAG, "User confirmed sign request, id: " + id);
            JSObject event = new JSObject();
            event.put("id", id);
            event.put("method", method);
            event.put("params", params);
            event.put("confirmed", true);
            notifyListeners("web3Request", event);
        });
        
        builder.setNegativeButton("Reject", (dialog, which) -> {
            Log.d(TAG, "User rejected sign request, id: " + id);
            sendErrorToWebView(id, "User rejected the request");
        });
        
        builder.setCancelable(false);
        builder.show();
    }
    
    private void sendErrorToWebView(int id, String error) {
        if (dappWebView != null) {
            getActivity().runOnUiThread(() -> {
                String escapedError = error.replace("\\", "\\\\").replace("'", "\\'");
                String js = String.format("if(window.ethereum) window.ethereum._handleResponse(%d, null, '%s');", id, escapedError);
                dappWebView.evaluateJavascript(js, null);
            });
        }
    }
}
