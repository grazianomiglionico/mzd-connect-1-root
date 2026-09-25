(function (topDocument, window, framework, log) {
    // =========================================================================
    // Rimuove dalla CMU l'avviso "Accumulo PM in DPF" (app "Avvisi di guida").
    //
    // Approccio CHIRURGICO e SICURO:
    //  - agisce SOLO su elementi VISIBILI che contengono ESATTAMENTE il titolo
    //    "accumulo pm in dpf" (ignora il testo precaricato/nascosto e i grandi
    //    contenitori come BODY);
    //  - nella LISTA avvisi: nasconde la RIGA;
    //  - nella schermata di DETTAGLIO: nasconde la vista del dettaglio;
    //  - NON clicca "back" e NON naviga mai (niente schermate che saltano).
    //
    // Solo grafica, nessun file di sistema: non puo' danneggiare nulla, si
    // ripristina al riavvio. Iniettato via MP3: nessun touch/terminale/tastiera.
    // =========================================================================

    // ------------------------------------------------------------- CONFIG ----
    var TITLE = 'accumulo pm in dpf';       // titolo esatto (minuscolo)
    var BODY_TXT = 'la sostanza particolata'; // inizio del testo di dettaglio
    var SWEEP_MS = 800;

    // ------------------------------------------------------------ utility ----
    function lc(s) {
        return ('' + (s || '')).toLowerCase();
    }

    function inXss(el) {
        while (el) {
            if (el.className && lc(el.className).indexOf('xss-') !== -1) return true;
            el = el.parentNode;
        }
        return false;
    }

    function describe(el) {
        var c = '';
        try {
            c = '' + (el.className || '');
        } catch (e) {
        }
        return (el.tagName || '?') + (el.id ? ('#' + el.id) : '') +
            (c ? ('.' + c.split(' ').join('.')) : '');
    }

    function isVisible(el) {
        try {
            var r = el.getBoundingClientRect();
            if (!(r.width > 0 && r.height > 0)) return false;
            var win = (el.ownerDocument && el.ownerDocument.defaultView) || window;
            var cs = win.getComputedStyle(el);
            if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
            return true;
        } catch (e) {
            return true;
        }
    }

    // Documento principale + eventuali iframe accessibili (qui di solito 1).
    function collectDocs() {
        var docs = [];
        function walk(doc, depth) {
            if (!doc || depth > 6) return;
            docs.push(doc);
            var ifr;
            try {
                ifr = doc.getElementsByTagName('iframe');
            } catch (e) {
                return;
            }
            for (var i = 0; i < ifr.length; i++) {
                var d = null;
                try {
                    d = ifr[i].contentDocument || (ifr[i].contentWindow && ifr[i].contentWindow.document);
                } catch (e) {
                    d = null;
                }
                if (d) walk(d, depth + 1);
            }
        }
        walk(topDocument, 0);
        window.__dpfDocCount = docs.length;
        return docs;
    }

    // Elementi "stretti" che contengono il titolo: contengono la frase ma NESSUN
    // figlio la contiene (cosi' non prendo BODY o grossi contenitori).
    function tightWrappers(doc) {
        var all, i, el, kids, j, childHas, out = [];
        try {
            all = doc.getElementsByTagName('*');
        } catch (e) {
            return out;
        }
        for (i = 0; i < all.length; i++) {
            el = all[i];
            if (inXss(el)) continue;
            if (lc(el.textContent).indexOf(TITLE) === -1) continue;
            childHas = false;
            kids = el.children || [];
            for (j = 0; j < kids.length; j++) {
                if (lc(kids[j].textContent).indexOf(TITLE) !== -1) {
                    childHas = true;
                    break;
                }
            }
            if (!childHas) out.push(el);
        }
        return out;
    }

    function rowAncestor(el) {
        var p = el, guard = 0, tag, c;
        while (p && p.nodeType === 1 && guard < 6) {
            tag = (p.tagName || '').toLowerCase();
            c = lc(p.className);
            if (tag === 'li' || /listitem|list-item|row|cell/.test(c)) return p;
            p = p.parentNode;
            guard++;
        }
        return null;
    }

    // Vista di dettaglio: risale finche' trova un contenitore (non body/html) che
    // contiene ANCHE il testo lungo del dettaglio.
    function detailAncestor(el) {
        var p = el, guard = 0, tag;
        while (p && p.nodeType === 1 && guard < 10) {
            tag = (p.tagName || '').toLowerCase();
            if (tag !== 'body' && tag !== 'html') {
                if (lc(p.textContent).indexOf(BODY_TXT) !== -1) return p;
            }
            p = p.parentNode;
            guard++;
        }
        return null;
    }

    function hide(el) {
        if (!el) return false;
        var tag = (el.tagName || '').toLowerCase();
        if (tag === 'body' || tag === 'html') return false; // mai nascondere tutto
        try {
            el.setAttribute('data-dpf-hidden', '1');
        } catch (e) {
        }
        try {
            el.style.display = 'none';
        } catch (e) {
        }
        try {
            el.style.visibility = 'hidden';
        } catch (e) {
        }
        window.__dpfLastHidden = describe(el);
        return true;
    }

    function process() {
        updateStatus();
        if (!window.__dpfOn) return;
        var docs = collectDocs(), d, ws, i, w, target, did = 0;
        for (d = 0; d < docs.length; d++) {
            ws = tightWrappers(docs[d]);
            for (i = 0; i < ws.length; i++) {
                w = ws[i];
                if (!isVisible(w)) continue;              // solo cio' che si vede
                window.__dpfLastMatch = describe(w);
                target = rowAncestor(w) || detailAncestor(w) || w;
                if (hide(target)) did++;
            }
        }
        if (did) {
            window.__dpfCount = (window.__dpfCount || 0) + did;
            window.__dpfFound = true;
        }
        updateStatus();
    }

    // ------------------------------------------------ barra di stato/diagnosi ---
    function ensureStatus() {
        if (window.__dpfStatusEl && window.__dpfStatusEl.parentNode) return window.__dpfStatusEl;
        try {
            var el = topDocument.createElement('div');
            el.className = 'xss-status';
            (topDocument.body || topDocument.documentElement).appendChild(el);
            window.__dpfStatusEl = el;
        } catch (e) {
        }
        return window.__dpfStatusEl;
    }

    function updateStatus() {
        var el = ensureStatus();
        if (!el) return;
        var s = 'DPF ' + (window.__dpfOn ? 'ON' : 'OFF') +
            ' | docs:' + (window.__dpfDocCount || 0) +
            ' | nascosti:' + (window.__dpfCount || 0) +
            ' | ultima riga: ' + (window.__dpfLastHidden || '-');
        try {
            el.innerHTML = s;
        } catch (e) {
        }
    }

    // ---------------------------------------------------------- menu XSS ----
    function xssLog(view, msg, className) {
        var b = topDocument.createElement("div");
        b.className = className;
        b.innerHTML = msg;
        view.appendChild(b);
    }

    function action(parent, name, cb, view) {
        var b = topDocument.createElement("div");
        b.innerHTML = name;
        b.className = 'xss-action';
        b.addEventListener('mousedown', function () {
            view.innerHTML = "";
            cb(view);
        }, false);
        parent.appendChild(b);
    }

    function toggleFilter(view) {
        window.__dpfOn = !window.__dpfOn;
        xssLog(view, 'DPF remove: ' + (window.__dpfOn ? 'ON' : 'OFF'), 'xss-hint');
        if (window.__dpfOn) process();
    }

    function forceNow(view) {
        xssLog(view, 'rimuovo ora...', 'xss-hint');
        process();
        xssLog(view, 'nascosti totali: ' + (window.__dpfCount || 0));
        xssLog(view, 'ultimo match: ' + (window.__dpfLastMatch || '(nessuno)'), 'xss-cmd');
    }

    function showInfo(view) {
        xssLog(view, 'remove: ' + (window.__dpfOn ? 'ON' : 'OFF'));
        xssLog(view, 'documenti: ' + (window.__dpfDocCount || 0) + ' | nascosti: ' + (window.__dpfCount || 0));
        xssLog(view, 'ultimo match:', 'xss-hint');
        xssLog(view, window.__dpfLastMatch || '(nessuno)', 'xss-cmd');
        xssLog(view, 'ultima riga nascosta:', 'xss-hint');
        xssLog(view, window.__dpfLastHidden || '(nessuna)', 'xss-cmd');
    }

    function createMenu() {
        var wrapper = topDocument.createElement("div");
        wrapper.className = 'xss-wrapper';
        var actions = topDocument.createElement("div");
        actions.className = 'xss-actions';
        var view = topDocument.createElement("div");
        view.className = 'xss-view';
        wrapper.appendChild(actions);
        wrapper.appendChild(view);
        action(actions, 'DPF remove ON/OFF', toggleFilter, view);
        action(actions, 'Rimuovi avviso ora', forceNow, view);
        action(actions, 'Info / diagnosi', showInfo, view);
        return wrapper;
    }

    function mount() {
        var wrapper = createMenu();
        var toggle = topDocument.createElement("div");
        toggle.innerHTML = "^";
        toggle.className = 'xss-toggle';
        toggle.addEventListener('mousedown', function () {
            window.XSSwrapper.classList.toggle('xss-collapse');
        }, false);
        topDocument.body.appendChild(toggle);
        topDocument.body.appendChild(wrapper);
        window.xssMounted = true;
        window.XSSwrapper = wrapper;
        window.XSStoggle = toggle;
    }

    // ------------------------------------------------------------- boot ----
    var isDevXss = !window.document.body;
    if (isDevXss) {
        if (!window.framework) {
            var framework = {};
            framework.sendEventToMmui = function () {
            };
        }
        window.onload = function run() {
            mount();
            window.__dpfOn = true;
            window.__dpfSweep = setInterval(process, SWEEP_MS);
            process();
            window.xssCssReady = true;
        };
    } else {
        if (!window.xssCssReady) {
            utility.loadCss('../../../mnt/sda1/css/init.css');
            utility.loadCss('../../../mnt/sdb1/css/init.css');
            utility.loadCss('../../../mnt/sdc1/css/init.css');
            utility.loadCss('../../../mnt/sdd1/css/init.css');
            window.xssCssReady = true;
        }
        if (!window.xssMounted) {
            mount();
        }
        if (window.__dpfOn === undefined) window.__dpfOn = true;
        if (!window.__dpfSweep) {
            window.__dpfSweep = setInterval(process, SWEEP_MS);
        }
        process();
    }

})(document, window, window.framework, window.log);
