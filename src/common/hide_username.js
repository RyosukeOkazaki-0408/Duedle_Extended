// Moodle may omit the navigation name on narrow layouts or render it later.
(() => {
    const anonymousGreeting = "おかえりなさい！👋";
    function anonymize() {
        const names = [...document.querySelectorAll(".usertext")];
        const usernameTexts = names.map(node => node.textContent.trim()).filter(Boolean);
        if (document.body.id === "page-my-index") {
            for (const greeting of document.querySelectorAll("h2.mb-3.mt-3, #page-header h2")) {
                const text = greeting.textContent.trim();
                if (text !== anonymousGreeting &&
                    (/^(?:おかえりなさい|こんにちは)[、，,!！\s]/u.test(text) ||
                     usernameTexts.some(name => text.includes(name)))) {
                    greeting.textContent = anonymousGreeting;
                }
            }
        }
        for (const name of names) {
            if (name.textContent) name.textContent = "";
        }
    }
    anonymize();
    new MutationObserver(anonymize).observe(document.body, {
        childList: true, subtree: true, characterData: true,
    });
})();
