function show(platform, enabled, useSettingsInsteadOfPreferences) {
    document.body.classList.add(`platform-${platform}`);

    if (useSettingsInsteadOfPreferences) {
        document.querySelector('p.platform-mac.state-on').innerText = "Duedle は有効です。Safari で Moodle を開き、サイトへのアクセスを許可してください。";
        document.querySelector('p.platform-mac.state-off').innerText = "Duedle は無効です。Safari の「設定」→「機能拡張」でオンにしてください。";
        document.querySelector('p.platform-mac.state-unknown').innerText = "Safari の「設定」→「機能拡張」で Duedle をオンにしてください。";
    }

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}
