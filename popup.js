document.getElementById('uploadFile').addEventListener('change', async function(event) {
    if (event.target.files.length === 0) return;
    
    document.getElementById('spinner').style.display = 'block';
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        mammoth.convertToHtml({arrayBuffer: e.target.result})
            .then(res => {
                processAndDisplay(res.value);
            })
            .finally(() => document.getElementById('spinner').style.display = 'none');
    };
    reader.readAsArrayBuffer(event.target.files[0]);
});

function processAndDisplay(html) {
    let doc = new DOMParser().parseFromString(html, 'text/html');
    
    const mode = document.querySelector('input[name="mode"]:checked').value;

    // ۱. پردازش جدول‌ها
    doc.querySelectorAll('table').forEach(table => {
        if (mode === 'js') {
            table.setAttribute('border', '1');
            let colCount = table.rows[0] ? table.rows[0].cells.length : 0;
            if (colCount > 0) {
                let colgroup = doc.createElement('colgroup');
                for(let i=0; i<colCount; i++) colgroup.appendChild(doc.createElement('col'));
                table.insertBefore(colgroup, table.firstChild);
            }
        } else {
            table.removeAttribute('border');
            table.removeAttribute('style');
            
            // حذف thead و انتقال tr های آن به داخل tbody برای PHP
            let thead = table.querySelector('thead');
            let tbody = table.querySelector('tbody');
            
            if (!tbody) {
                tbody = doc.createElement('tbody');
                table.appendChild(tbody);
            }
            
            if (thead) {
                let theadRows = Array.from(thead.querySelectorAll('tr'));
                for (let i = theadRows.length - 1; i >= 0; i--) {
                    tbody.insertBefore(theadRows[i], tbody.firstChild);
                }
                thead.remove();
            }
            
            table.querySelectorAll('th').forEach(th => {
                let td = doc.createElement('td');
                td.innerHTML = th.innerHTML;
                th.parentNode.replaceChild(td, th);
            });
        }
    });

    // ۲. پردازش سلول‌ها
    doc.querySelectorAll('td, th').forEach(cell => {
        if (mode === 'js') {
            cell.setAttribute('class', 'border border-gray-300 px-2 py-2 text-center');
        } else {
            cell.removeAttribute('class');
            cell.removeAttribute('style');
        }
        let p = cell.querySelector('p');
        if (p) {
            cell.textContent = p.textContent;
        }
    });
    
    // ۳. منطق آکاردئون
    doc.querySelectorAll('h5').forEach(h5 => {
        let details = doc.createElement('details');
        details.setAttribute('open', 'open');
        let summary = doc.createElement('summary');
        summary.innerHTML = h5.innerHTML;
        details.appendChild(summary);
        
        let div = doc.createElement('div');
        div.className = 'mce-accordion-body';
        let sibling = h5.nextElementSibling;
        while(sibling && !sibling.tagName.match(/^H[1-6]$/)) {
            let next = sibling.nextElementSibling;
            div.appendChild(sibling);
            sibling = next;
        }
        details.appendChild(div);
        h5.parentNode.replaceChild(details, h5);
    });

    // ۴. منطق جدید بلاک‌کوت (پشتیبانی از متون چندپاراگرافی در هر دو حالت JS و PHP)
    let inQuote = false;
    let quoteParagraphs = [];
    
    let allParagraphs = Array.from(doc.querySelectorAll('p'));
    
    allParagraphs.forEach(p => {
        let text = p.textContent.trim();
        
        // حالت اول: شروع و پایان در یک پاراگراف واحد
        if (text.startsWith('«') && text.endsWith('»')) {
            let bq = doc.createElement('blockquote');
            let cleanText = text.replace(/^«|»$/g, '');
            let lines = cleanText.split('\n').filter(l => l.trim() !== "");
            if (lines.length === 0) lines = [cleanText];
            
            lines.forEach(line => {
                let pNew = doc.createElement('p');
                pNew.textContent = line.trim();
                bq.appendChild(pNew);
            });
            p.parentNode.replaceChild(bq, p);
            return;
        }
        
        // حالت دوم: شروع نقل‌قول در این پاراگراف
        if (text.startsWith('«')) {
            inQuote = true;
            quoteParagraphs = [];
            p.textContent = text.replace(/^«/, '').trim();
            quoteParagraphs.push(p);
            return;
        }
        
        // پاراگراف پایانی نقل‌قول
        if (inQuote && text.endsWith('»')) {
            p.textContent = text.replace(/»$/, '').trim();
            quoteParagraphs.push(p);
            
            let bq = doc.createElement('blockquote');
            // درج بلاک‌کوت قبل از اولین پاراگراف پیدا شده
            quoteParagraphs[0].parentNode.insertBefore(bq, quoteParagraphs[0]);
            
            // انتقال تمام پاراگراف‌های ذخیره شده به داخل بلاک‌کوت
            quoteParagraphs.forEach(node => {
                bq.appendChild(node);
            });
            
            inQuote = false;
            quoteParagraphs = [];
            return;
        }
        
        // پاراگراف‌های میانی (بین شروع و پایان)
        if (inQuote) {
            quoteParagraphs.push(p);
        }
    });

    let finalHtml = doc.body.innerHTML;
    document.getElementById('outputHtml').value = finalHtml;
    document.getElementById('preview').innerHTML = finalHtml;
}

// دکمه کپی
document.getElementById('copyBtn').addEventListener('click', () => {
    const htmlCode = document.getElementById('outputHtml').value;
    if (!htmlCode) return;
    navigator.clipboard.writeText(htmlCode);
    saveToHistory(htmlCode); 
    alert('کد کپی و در تاریخچه ذخیره شد!');
});

function saveToHistory(html) {
    chrome.storage.local.get(['history'], (data) => {
        let history = data.history || [];
        history.unshift({ title: new Date().toLocaleTimeString('fa-IR'), fullCode: html });
        history = history.slice(0, 10);
        chrome.storage.local.set({history}, renderHistory);
    });
}

function renderHistory() {
    chrome.storage.local.get(['history'], (data) => {
        const list = document.getElementById('historyList');
        list.innerHTML = '';
        (data.history || []).forEach(item => {
            let li = document.createElement('li');
            li.style.cursor = 'pointer';
            li.style.color = '#28a745';
            li.style.textDecoration = 'underline';
            li.style.marginBottom = '5px';
            li.textContent = "کد ثبت شده در: " + item.title;
            li.addEventListener('click', () => {
                document.getElementById('outputHtml').value = item.fullCode;
                document.getElementById('preview').innerHTML = item.fullCode;
            });
            list.appendChild(li);
        });
    });
}

renderHistory();