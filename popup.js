const uploadFile = document.getElementById('uploadFile');
const copyBtn = document.getElementById('copyBtn');
const outputHtml = document.getElementById('outputHtml');
let toastTimer;

function showToast(message, error = false) {
    const toast = document.getElementById('toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('error', error);
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function linksInNewTab(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('a[href]').forEach(link => {
        link.setAttribute('target', '_blank');
        const rel = new Set((link.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
        rel.delete('opener');
        rel.add('noopener');
        link.setAttribute('rel', [...rel].join(' '));
    });
    return doc.body.innerHTML;
}

function displayOutput(html) {
    html = html.trim() ? linksInNewTab(html) : html;
    outputHtml.value = html;
    document.getElementById('preview').innerHTML = html;
    document.getElementById('previewEmpty').hidden = Boolean(html.trim());
    copyBtn.disabled = !html.trim();
    document.getElementById('outputStatus').textContent = html.trim() ? 'خروجی آماده است' : 'هنوز محتوایی برای نمایش نیست';
}

uploadFile.addEventListener('change', async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    document.getElementById('fileName').textContent = file.name;
    if (!/\.docx$/i.test(file.name)) {
        showToast('لطفاً یک فایل Word با فرمت .docx انتخاب کنید.', true);
        return;
    }
    document.getElementById('spinner').hidden = false;
    uploadFile.disabled = true;
    copyBtn.disabled = true;
    document.querySelectorAll('input[name="mode"]').forEach(input => { input.disabled = true; });
    document.querySelector('.output').setAttribute('aria-busy', 'true');
    try {
        const buffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({arrayBuffer: buffer});
        processAndDisplay(result.value);
    } catch (error) {
        showToast('تبدیل انجام نشد. سالم بودن فایل Word را بررسی کنید.', true);
    } finally {
        document.getElementById('spinner').hidden = true;
        uploadFile.disabled = false;
        copyBtn.disabled = !outputHtml.value.trim();
        document.querySelectorAll('input[name="mode"]').forEach(input => { input.disabled = false; });
        document.querySelector('.output').setAttribute('aria-busy', 'false');
        uploadFile.value = '';
    }
});

outputHtml.addEventListener('input', () => { displayOutput(outputHtml.value); });

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
            if (p.querySelector('a[href]')) {
                cell.innerHTML = p.innerHTML;
            } else {
                cell.textContent = p.textContent;
            }
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
    displayOutput(finalHtml);
}

// کپی موفق، سپس ذخیره در تاریخچه
copyBtn.addEventListener('click', async () => {
    const htmlCode = outputHtml.value;
    if (!htmlCode.trim()) return;
    try {
        await navigator.clipboard.writeText(htmlCode);
    } catch (error) {
        showToast('کپی انجام نشد؛ کد را انتخاب و دستی کپی کنید.', true);
        return;
    }
    chrome.storage.local.get(['history'], (data) => {
        if (chrome.runtime.lastError) {
            showToast('کد کپی شد، اما خواندن تاریخچه انجام نشد.', true);
            return;
        }
        const history = Array.isArray(data.history) ? data.history : [];
        history.unshift({ title: new Date().toLocaleTimeString('fa-IR'), fullCode: htmlCode });
        chrome.storage.local.set({history: history.slice(0, 10)}, () => {
            if (chrome.runtime.lastError) {
                showToast('کد کپی شد، اما ذخیره تاریخچه انجام نشد.', true);
                return;
            }
            renderHistory();
            showToast('کد کپی و در تاریخچه ذخیره شد.');
        });
    });
});

function renderHistory() {
    chrome.storage.local.get(['history'], (data) => {
        if (chrome.runtime.lastError) {
            showToast('خواندن تاریخچه انجام نشد.', true);
            return;
        }
        const list = document.getElementById('historyList');
        list.replaceChildren();
        const history = Array.isArray(data.history) ? data.history : [];
        document.getElementById('historyEmpty').hidden = history.length > 0;
        history.slice(0, 10).forEach((item, index) => {
            const li = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'history-item';
            const icon = document.createElement('span');
            icon.className = 'history-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = '↶';
            const label = document.createElement('span');
            label.textContent = 'بازیابی خروجی ' + (index + 1).toLocaleString('fa-IR');
            const time = document.createElement('span');
            time.className = 'history-time';
            time.textContent = item.title;
            button.append(icon, label, time);
            button.addEventListener('click', () => {
                displayOutput(item.fullCode);
                showToast('خروجی از تاریخچه بازیابی شد.');
            });
            li.appendChild(button);
            list.appendChild(li);
        });
    });
}

renderHistory();
