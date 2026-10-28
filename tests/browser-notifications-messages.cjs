// Moodle notification and message drawer structures, using synthetic data only.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

const luminance = color => color.match(/[\d.]+/g).slice(0,3).map(Number).reduce((sum,v,i) => {
    const s = v / 255;
    return sum + [0.2126,0.7152,0.0722][i] * (s <= .04045 ? s / 12.92 : ((s+.055)/1.055)**2.4);
},0);
const contrast = (a,b) => {
    const x=luminance(a),y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};

(async () => {
    const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    try {
        const page = await browser.newPage();
        await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
            body{margin:0;background:white;color:#1d2125;font:16px sans-serif} a{color:#0068d9}
            #nav-notification-popover-container{position:relative;max-width:420px}
            .popover-region-toggle::before,.popover-region-toggle::after{content:'';display:inline-block;border:6px solid transparent;border-bottom-color:#ddd}
            .popover-region-toggle::after{border-bottom-color:#fff}.popover-region-container{background:#fff;border:1px solid #ddd}
            .popover-region-header-container,.content-item-container{border-bottom:1px solid #ddd;padding:8px}
            .content-item-container.unread{background:#eef5ff}.content-item-container:hover{background:#f5f5f5}
            .popover-region-footer-container{background:#fff;border-top:1px solid #ddd;padding:8px}
            .message-app{max-width:420px;background:#eff1f3;color:#1d2125;padding:8px}
            .message-app .body-container{height:150px;overflow:auto}
            .message-app .sticky-top{position:sticky;top:0;z-index:1;border-bottom:1px solid #ddd}
            .message-app .day{color:#1d2125;text-align:center;margin:12px 0}
            .message-app .message{position:relative;margin:12px 0;padding:8px;border-radius:4px}
            .message-app .message.received{background:white;color:#1d2125}.message-app .message.send{background:#d8f3d8;color:#1d2125}
            .message-app .message .tail{position:absolute;bottom:0;left:-8px;border:8px solid transparent;border-bottom-color:white}
            .message-app .message .time{color:#616466}.message-app textarea{display:block;width:95%;min-height:40px}
        </style></head><body><nav id="nav-notification-popover-container" class="popover-region popover-region-notifications">
          <button class="popover-region-toggle" aria-expanded="true">通知</button>
          <div class="popover-region-container" role="region"><div class="popover-region-header-container"><h3 class="popover-region-header-text">通知</h3><button id="mark-all">すべて既読</button><a href="#settings">設定</a></div>
            <div class="popover-region-content-container"><div class="popover-region-content"><div class="all-notifications">
              <div class="content-item-container notification"><a class="context-link" href="#one"><div class="notification-message">期限のお知らせ</div><div class="timestamp">2時間前</div></a><a class="view-more" href="#detail">通知詳細</a></div>
              <div class="content-item-container notification unread"><a class="context-link" href="#two">未読のお知らせ</a></div>
            </div><div class="empty-message" hidden>通知はありません</div></div></div>
            <a class="see-all-link" href="#all"><div class="popover-region-footer-container">すべてを表示する</div></a>
          </div></nav>
          <section class="message-app" data-region="message-drawer"><div class="header-container"><a href="#back">戻る</a><h2>メッセージ</h2></div>
            <div class="body-container"><div class="sticky-top" data-region="contact-request-sent-message-container">コンタクトリクエストを送信しました。</div><div data-region="day-container"><h6 class="day">2026年 10月 28日</h6><div class="message received"><div class="tail"></div><div class="time" data-region="time-created">18:13</div><p>複数行のメッセージ<br>改行後の本文</p><a href="#message">リンク</a></div><div class="message send"><div class="tail"></div><div class="time">18:14</div><p>送信済みメッセージ</p></div></div></div>
            <div class="footer-container"><label>下書き<textarea>編集中の文章</textarea></label><button id="send">送信</button></div>
          </section><div id="unrelated" class="popover-region-container" style="background:white;color:black">別のポップアップ</div>
        </body></html>`);
        const dark = await page.addStyleTag({path:'src/theme/dark.css'});
        for (const file of ['light.css','ios.css']) await page.addStyleTag({path:'src/theme/'+file});
        await page.addScriptTag({path:'src/theme/state.js'});
        await page.evaluate(() => {
            document.querySelector('.popover-region-toggle').addEventListener('click', event => {
                const button=event.currentTarget, open=button.getAttribute('aria-expanded')==='true';
                button.setAttribute('aria-expanded',String(!open));
                document.querySelector('.popover-region-container').hidden=open;
            });
        });
        const style = selector => page.locator(selector).first().evaluate(el=>{const s=getComputedStyle(el);return {color:s.color,bg:s.backgroundColor,border:s.borderBottomColor};});
        const tail = () => style('.message.received .tail');
        const colors = async () => Promise.all(['.popover-region-container','.popover-region-header-text','.popover-region-footer-container','.notification:not(.unread) .context-link','.notification.unread','.notification.unread .context-link','.message-app','.day','.message.received','.message.send','.message .time','#unrelated','[data-region="contact-request-sent-message-container"]'].map(style));
        let checked=0;
        for (const width of [320,390,1280]) {
            await page.setViewportSize({width,height:900});
            for (const ios of [false,true]) for (const mode of [0,1,2,3]) for (const os of ['light','dark']) {
                await page.emulateMedia({colorScheme:os});
                await page.evaluate(({mode,ios})=>duedleApplyTheme(mode,ios),{mode,ios});
                const values=await colors();
                const [panel,header,footer,link,unread,unreadLink,drawer,day,received,sent,time,unrelated,sticky]=values;
                const isDark=mode===1 || mode===0 && os==='dark';
                if (isDark) {
                    for (const [foreground,background] of [[header.color,panel.bg],[link.color,panel.bg],[footer.color,footer.bg],
                        [unreadLink.color,unread.bg],[day.color,drawer.bg],[received.color,received.bg],[sent.color,sent.bg],[time.color,received.bg],[sticky.color,sticky.bg]]) {
                        assert(contrast(foreground,background)>=4.5,`${width}/${mode}/${ios}/${os}: ${foreground} on ${background}`);
                    }
                    assert.notEqual(unread.bg,panel.bg,'Unread remains distinguishable');
                    assert.equal((await tail()).border,received.bg,'Speech tail matches received bubble');
                    assert.equal(sticky.bg,drawer.bg,'Sticky notice must hide the messages scrolling underneath');
                    assert.equal((await style('#unrelated')).bg,'rgb(255, 255, 255)','Other popovers are unaffected');
                } else {
                    await dark.evaluate(el=>el.disabled=true);
                    assert.deepEqual(await colors(),values,'Light and honobono render identically without dark stylesheet');
                    await dark.evaluate(el=>el.disabled=false);
                }
                assert.equal(await page.locator('textarea').inputValue(),'編集中の文章');
                assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow');
                checked++;
            }
        }
        await page.evaluate(()=>duedleApplyTheme(1,true));
        await page.locator('.popover-region-toggle').click();
        assert.equal(await page.locator('.popover-region-toggle').getAttribute('aria-expanded'),'false');
        assert.equal(await page.locator('#nav-notification-popover-container .popover-region-container').isVisible(),false);
        await page.locator('.popover-region-toggle').click();
        assert.equal(await page.locator('#nav-notification-popover-container .popover-region-container').isVisible(),true);
        await page.locator('.notification:not(.unread) .context-link').focus();
        assert(await page.locator('.notification:not(.unread) .context-link').evaluate(e=>e===document.activeElement));
        const dateBox=await page.locator('.day').boundingBox(), messageBox=await page.locator('.message.received').boundingBox();
        assert(dateBox.y+dateBox.height<=messageBox.y,'Date and message do not overlap');
        await page.locator('.body-container').evaluate(el=>{el.scrollTop=65;});
        const overlapping=await page.evaluate(()=>{
            const scroller=document.querySelector('.message-app .body-container');
            const notice=document.querySelector('[data-region="contact-request-sent-message-container"]');
            const message=document.querySelector('.message.received');
            const n=notice.getBoundingClientRect(),m=message.getBoundingClientRect();
            return {scroll:scroller.scrollTop,overlap:n.top<m.bottom && n.bottom>m.top,background:getComputedStyle(notice).backgroundColor};
        });
        assert(overlapping.scroll>0 && overlapping.overlap,'Sticky notice overlays a message while scrolling');
        assert.equal(overlapping.background,(await style('.message-app')).bg,'The overlapping message is covered by the notice surface');
        await page.screenshot({path:'/private/tmp/duedle-notification-message-dark.png',fullPage:true});
        console.log(`PASS notification/message colors,  ${checked} theme/viewport cases, dark contrast, light isolation, open/close, focus, draft and layout`);
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
