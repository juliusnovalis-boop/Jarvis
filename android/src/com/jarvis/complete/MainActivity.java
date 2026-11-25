package com.jarvis.complete;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.text.InputType;
import android.view.Menu;
import android.view.MenuItem;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;

/**
 * Client J.A.R.V.I.S. — coque WebView autour de l'interface mobile.
 *
 * Première ouverture : saisie de l'adresse du PC qui héberge Jarvis
 * (ex. http://192.168.1.10:3210/mobile), mémorisée dans les préférences.
 * Menu « Adresse du serveur » pour la modifier à tout moment.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "jarvis";
    private static final String KEY_URL = "server_url";
    private static final String FALLBACK = "http://192.168.1.10:3210/mobile";

    private WebView web;
    private String currentUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setDatabaseEnabled(true);
        web.getSettings().setMediaPlaybackRequiresUserGesture(false);
        web.getSettings().setAllowFileAccess(false);
        web.setWebViewClient(new WebViewClient());

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.addView(web, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        currentUrl = prefs.getString(KEY_URL, FALLBACK);
        web.loadUrl(currentUrl);
    }

    /* ---------- Menu (100 % programmatique, aucune ressource) ---------- */

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        menu.add(Menu.NONE, 1, Menu.NONE, "Adresse du serveur");
        menu.add(Menu.NONE, 2, Menu.NONE, "Recharger la page");
        menu.add(Menu.NONE, 3, Menu.NONE, "Interface complète");
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        int id = item.getItemId();
        if (id == 1) {
            promptAddress();
            return true;
        }
        if (id == 2) {
            web.reload();
            return true;
        }
        if (id == 3) {
            navigate(stripTail(currentUrl) + "/");
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    /* ---------- Adresse du serveur ---------- */

    private void navigate(String url) {
        currentUrl = url;
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_URL, url).apply();
        web.loadUrl(url);
    }

    private static String stripTail(String url) {
        String u = url == null ? "" : url.trim();
        while (u.endsWith("/")) {
            u = u.substring(0, u.length() - 1);
        }
        int idx = u.indexOf("/mobile");
        return idx > 0 ? u.substring(0, idx) : u;
    }

    private void promptAddress() {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setSingleLine(true);
        input.setText(currentUrl);
        input.setHint("http://192.168.1.10:3210/mobile");
        input.setPadding(32, 16, 32, 16);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Serveur J.A.R.V.I.S.")
                .setMessage("Adresse du PC qui fait tourner Jarvis (même réseau Wi-Fi).")
                .setView(input)
                .setPositiveButton("Ouvrir", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        String url = input.getText().toString().trim();
                        if (url.length() > 0) {
                            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                                url = "http://" + url;
                            }
                            navigate(url);
                        }
                    }
                })
                .setNegativeButton("Annuler", null)
                .setNeutralButton("Défaut", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        navigate(FALLBACK);
                    }
                })
                .create();
        dialog.show();
    }
}
