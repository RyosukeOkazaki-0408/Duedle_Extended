function show(platform, enabled, useSettingsInsteadOfPreferences) {
    document.body.classList.add(`platform-${platform}`);

    if (useSettingsInsteadOfPreferences) {
        document.getElementsByClassName('platform-mac state-on')[0].innerText = "Duedle は有効です。Safari で Moodle を開き、サイトへのアクセスを許可してください。";
        document.getElementsByClassName('platform-mac state-off')[0].innerText = "Duedle は無効です。Safari の「設定」→「機能拡張」でオンにしてください。";
        document.getElementsByClassName('platform-mac state-unknown')[0].innerText = "Safari の「設定」→「機能拡張」で Duedle をオンにしてください。";
        document.getElementsByClassName('platform-mac open-preferences')[0].innerText = "Safari の機能拡張設定を開く";
    }

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
