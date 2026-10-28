//右上の名前の非表示
const username = document.querySelector(".usertext");
const usernameText = username?.textContent.trim();
if (username) username.textContent = "";

// Only replace a dashboard greeting that actually contains the user's name.
if (document.body.id === "page-my-index" && usernameText) {
    const greeting = [...document.querySelectorAll("h2.mb-3.mt-3")]
        .find(element => element.textContent.includes(usernameText));
    if (greeting) greeting.textContent = "おかえりなさい！👋";
}

