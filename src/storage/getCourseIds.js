//data-course-idが後で生成されるので、mutation
let timeout;
async function scanCourses() {
    const coursefilter = document.querySelector("span[data-active-item-text]")?.textContent.trim();
    if(coursefilter?.includes("削除済み")){
        return;
    }

    const courses = document.querySelectorAll("li.course-listitem[data-course-id]");
    if(!courses.length){
        return;
    }

    const ids = [...courses].map(
        c => Number(c.dataset.courseId)
    );

    const stored = (await ext.storage.local.get("courseIds")).courseIds || [];
    await ext.storage.local.set({ courseIds: [...new Set([...stored, ...ids])]
        .filter(id => Number.isInteger(id) && id > 0) });
}

const observer = new MutationObserver(() => {
    clearTimeout(timeout);
    timeout = setTimeout(scanCourses, 300);
});

//実行
window.addEventListener("load", scanCourses);
scanCourses().catch(console.error);
// 監視開始
observer.observe(document.body, {
    childList: true,
    subtree: true
});
