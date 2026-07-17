var MdBundle;

function log(msg) {
    Zotero.debug("MdBundle: " + msg);
}

function install() {
    log("Installed");
}

async function startup({ id, version, rootURI }) {
    log("Starting " + version);
    Services.scriptloader.loadSubScript(rootURI + 'mdbundle.js');
    MdBundle.init({ id, version, rootURI });
    await MdBundle.loadStrings();
    MdBundle.addToAllWindows();
}

function onMainWindowLoad({ window }) {
    MdBundle.addToWindow(window);
}

function onMainWindowUnload({ window }) {
    MdBundle.removeFromWindow(window);
}

function shutdown() {
    log("Shutting down");
    MdBundle.removeFromAllWindows();
    MdBundle = undefined;
}

function uninstall() {
    log("Uninstalled");
}
