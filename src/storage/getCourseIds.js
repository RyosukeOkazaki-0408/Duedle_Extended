//data-course-idが後で生成されるので、mutation
let timeout;
async function scanCourses() {
    try {
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
    } catch (error) {
        if (/extension context invalidated/i.test(error?.message || "")) {
            return;
        }
        console.error("Duedle: コース情報の保存に失敗しました。", error);
    }
}

const observer = new MutationObserver(() => {
    clearTimeout(timeout);
    timeout = setTimeout(() => { void scanCourses(); }, 300);
});

//実行
window.addEventListener("load", scanCourses);
void scanCourses();
// 監視開始
observer.observe(document.body, {
    childList: true,
    subtree: true
});
