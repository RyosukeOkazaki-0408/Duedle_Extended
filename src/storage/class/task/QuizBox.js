class QuizBox extends TaskBox {
    constructor(data) {
        super(data);
    }
    async getElement() {
        const quiz = await super.getElement();
        quiz.classList.add("quiz");

        const point = this.data.point || this.data.point == 0 ? this.data.point : "?";
        const maxpoint = this.data.maxp || this.data.maxp == 0 ? this.data.maxp : "?";
        const required = this.data.required || this.data.required == 0 ? `(${this.data.required}必要)` : "";
        quiz.querySelector(".li3").textContent = `得点: ${point} / ${maxpoint}  ${required}`;

        const count = Number.isSafeInteger(this.data.count) && this.data.count >= 0 ? this.data.count : "?";
        const limit = this.data.maxcount;
        const maxcount = Number.isSafeInteger(limit) && limit >= 0 ? (limit === 0 ? "∞" : limit) : "?";
        quiz.querySelector(".li4").textContent = `受験回数: ${count} / ${maxcount}`;

        const link = document.createElement("a");
        link.href = `${globalThis.DuedleSites?.root() ?? "https://cms7.ict.nitech.ac.jp/moodle40a/"}mod/quiz/view.php?id=${this.data.quizId}`;
        link.textContent = this.data.quizName;
        quiz.querySelector(".taskbox").appendChild(link);

        const showbutton = quiz.querySelector(".showbutton");
        const updateShowLabel = () => { showbutton.textContent = this.data.show ? "一覧から削除する" : "一覧に戻す"; };
        updateShowLabel();
        showbutton.addEventListener("click", async () => {
            const show = !this.data.show;
            await StorageUtil.editData('quiz_list', "quizId", this.data.quizId, "show", show);
            this.data.show = show;
            const { selectedShow } = await ext.storage.sync.get(["selectedShow"]);
            if (selectedShow === "all") updateShowLabel();
            else quiz.remove();
        });
        const manualComplete = quiz.querySelector(".manualComplete");
        if (manualComplete) {
            manualComplete.addEventListener("click", async (e) => {
                await StorageUtil.editData('quiz_list', "quizId", this.data.quizId, "status", "complete");
                quiz.classList.remove("unknown");
                quiz.classList.add("complete");
                colorReload();
                manualComplete.setAttribute("hidden","");
            });
        }
        return quiz;
    }
}
