// //メニュー画面をかわいく
// const title = document.querySelector(".page-header-headings h1");
// if (title && title.textContent.includes("ダッシュボード")) {
//     title.textContent = "Duedle開発テスト中😋✌️";
// }

//navbarのタイトル
if (document.querySelector(".navbar-brand") && (!document.URL.match(/login/) || document.URL.match("auth_"))) {
    const navbar = document.querySelector(".navbar-brand");
    navbar.textContent = "Duedle: Extended"
}

//navbarに時間を
const time = document.createElement("div");
time.id = "realtime";
time.classList.add("navbar-brand","d-flex","align-items-center","my-1");
time.style.position = "absolute";
time.style.left = "50%";
time.style.transform = "translateX(-50%)";
const sel = document.querySelector("ul.navbar-nav");
if (sel) sel.after(time);

function twoDigit(num) {
    let ret;
    if (num < 10)
        ret = "0" + num;
    else
        ret = num;
    return ret;
}
function showClock() {
    let nowTime = new Date();
    let nowHour = twoDigit(nowTime.getHours());
    let nowMin = twoDigit(nowTime.getMinutes());
    let nowSec = twoDigit(nowTime.getSeconds());
    let msg = nowHour + ":" + nowMin + ":" + nowSec;
    document.getElementById("realtime").innerHTML = msg;
}
if (sel) {
    showClock();
    setInterval(showClock, 1000);
}



// Hide only the global course-list breadcrumbs, never named courses/activities.
document.querySelectorAll(".breadcrumb-item").forEach((item) => {
    const link = item.querySelector("a[href]");
    if (!link) return;
    try {
        const url = new URL(link.href, location.href);
        const isCourseList = url.pathname === "/moodle40a/my/courses.php"
            || (url.pathname === "/moodle40a/course/index.php" && !url.search);
        if (url.origin === location.origin && isCourseList) item.remove();
    } catch { /* An invalid link is not a course-list breadcrumb. */ }
});
