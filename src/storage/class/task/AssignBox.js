class AssignBox extends TaskBox {
    constructor(data) {
        super(data);
    }
    async getElement() {
        const assign = await super.getElement();
        assign.classList.add("assign");

        assign.querySelector(".li3").textContent = `最初のファイル名: ${this.data.file ? this.data.file : "不明"}`;
        const filenum = Number.isSafeInteger(this.data.filenum) && this.data.filenum >= 0 ? this.data.filenum : "?";
        assign.querySelector(".li4").textContent = `提出ファイル数: ${filenum}`;
        const link = document.createElement("a");
        link.href = `${globalThis.DuedleSites?.root() ?? "https://cms7.ict.nitech.ac.jp/moodle40a/"}mod/assign/view.php?id=${this.data.assignId}`;
        link.textContent = this.data.assignName;
        assign.querySelector(".taskbox").appendChild(link);

        const showbutton = assign.querySelector(".showbutton");
        const updateShowLabel = () => { showbutton.textContent = this.data.show ? "一覧から削除する" : "一覧に戻す"; };
        updateShowLabel();
        showbutton.addEventListener("click", async () => {
            const show = !this.data.show;
            await StorageUtil.editData('assign_list', "assignId", this.data.assignId, "show", show);
            this.data.show = show;
            const { selectedShow } = await ext.storage.sync.get(["selectedShow"]);
            if (selectedShow === "all") updateShowLabel();
            else assign.remove();
        });

        const manualComplete = assign.querySelector(".manualComplete");
        if(manualComplete){
            manualComplete.addEventListener("click", async (e) => {
                await StorageUtil.editData('assign_list', "assignId", this.data.assignId, "status", "complete");
                assign.classList.remove("unknown");
                assign.classList.add("complete");
                colorReload();
                manualComplete.setAttribute("hidden","");
            });
        }

        return assign;
    }
}
