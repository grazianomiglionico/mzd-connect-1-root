(function (topDocument, window, framework, log) {
    // =========================================================================
    // Rimuove/chiude l'avviso "Accumulo PM in DPF" dalla CMU.
    //
    // L'HMI carica ogni app (compresa "Avvisi di guida") in un IFRAME interno.
    // Questo script cerca l'avviso nel documento principale E dentro TUTTI gli
    // iframe (ricorsivamente), e:
    //   - nella LISTA avvisi: nasconde la riga "Accumulo PM in DPF"
    //   - nella schermata di dettaglio: prova a uscirne (back) e in fallback la
    //     nasconde.
    //
    // Iniettato all'avvio via MP3: nessun touch/terminale/tastiera/dump.
    // Agisce SOLO sulla grafica dell'HMI (nessun file di sistema): non puo'
    // danneggiare nulla, si ripristina al riavvio. Non tocca la spia cruscotto
    // ne' la centralina.
    // =========================================================================

    // ------------------------------------------------------------- CONFIG ----
    // Il testo dell'avviso contiene una di queste (minuscolo).
    var DPF_KEYWORDS = ['accumulo pm in dpf', 'particolato diesel', 'accumulo pm', 'in dpf'];

    // Sopra questa lunghezza di testo, l'elemento e' la schermata di DETTAGLIO
    // (non una riga di lista): in quel caso provo il back e poi nascondo.
    var DETAIL_TEXT_LEN = 80;

    // Ogni quanto ripassare tutti i documenti (ms).
    var SWEEP_MS = 1000;

    // ------------------------------------------------------------ utility ----
    function lc(s) {
        return ('' + (s || '')).toLowerCase();
    }

    function matchText(t) {
        for (var i = 0; i < DPF_KEYWORDS.length; i++) {
            if (DPF_KEYWORDS[i] && t.indexOf(DPF_KEYWORDS[i]) !== -1) return DPF_KEYWORDS[i];
        }
        return null;
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

    // Raccoglie il documento principale + tutti gli iframe accessibili (ricorsivo).
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
                    d = null; // cross-origin: non accessibile
                }
                if (d) walk(d, depth + 1);
            }
        }
        walk(topDocument, 0);
        window.__dpfDocCount = docs.length;
        return docs;
    }

    // Elemento piu' "stretto" che contiene il testo DPF, in un documento.
    function findBest(doc) {
        var all, i, el, t, best = null, bestLen = 1e9, kw = null;
        try {
            all = doc.getElementsByTagName('*');
        } catch (e) {
            return null;
        }
        for (i = 0; i < all.length; i++) {
            el = all[i];
            if (inXss(el)) continue;
            try {
                if (el.getAttribute && el.getAttribute('data-dpf-hidden') === '1') continue;
            } catch (e) {
            }
            t = lc(el.textContent);
            if (!t) continue;
            var m = matchText(t);
            if (m && t.length < bestLen) {
                bestLen = t.length;
                best = el;
                kw = m;
            }
        }
        if (best) window.__dpfBestLen = bestLen;
        return best ? {el: best, len: bestLen, kw: kw} : null;
    }

    function fireClick(el) {
        try {
            var types = ['mousedown', 'mouseup', 'click'], k, doc = el.ownerDocument || topDocument;
            for (k = 0; k < types.length; k++) {
                var ev = doc.createEvent('MouseEvents');
                ev.initMouseEvent(types[k], true, true, doc.defaultView || window,
                    1, 0, 0, 0, 0, false, false, false, false, 0, null);
                el.dispatchEvent(ev);
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    function clickBackIn(doc) {
        var all, i, el, sig, re = /back|return|prev|chevron|arrow|left|close|dismiss|exit/;
        try {
            all = doc.getElementsByTagName('*');
        } catch (e) {
            return false;
        }
        for (i = 0; i < all.length; i++) {
            el = all[i];
            if (inXss(el)) continue;
            sig = lc(el.className) + ' ' + lc(el.id);
            try {
                sig += ' ' + lc(el.getAttribute('data-id') || '') + ' ' + lc(el.getAttribute('role') || '');
            } catch (e) {
            }
            if (re.test(sig)) {
                if (fireClick(el)) {
                    window.__dpfBackHit = describe(el);
                    return true;
                }
            }
        }
        return false;
    }

    function hide(el) {
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
    }

    // Sale ai genitori finche' il testo resta corto e ancora "DPF": nasconde la
    // riga intera della lista (icona + testo) senza toccare il resto.
    function hideRow(el) {
        var target = el, p = el.parentNode, guard = 0;
        while (p && p.nodeType === 1 && guard < 6) {
            var t = lc(p.textContent);
            if (t.length <= DETAIL_TEXT_LEN && matchText(t) && !inXss(p)) {
                target = p;
                p = p.parentNode;
                guard++;
            } else {
                break;
            }
        }
        hide(target);
        window.__dpfLastHidden = describe(target);
    }

    // Riquadro di stato sempre visibile (per leggere/fotografare la diagnosi
    // senza dover premere nulla). Ha classe 'xss-' cosi' il filtro lo ignora.
    function ensureStatus() {
        if (window.__dpfStatusEl && window.__dpfStatusEl.parentNode) return window.__dpfStatusEl;
        var el;
        try {
            el = topDocument.createElement('div');
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
            ' | trovato:' + (window.__dpfFound ? 'SI' : 'NO') +
            ' | azioni:' + (window.__dpfCount || 0) +
            ' | match: ' + (window.__dpfLastMatch || '-');
        try {
            el.innerHTML = s;
        } catch (e) {
        }
    }

    function process() {
        if (!window.__dpfOn) {
            updateStatus();
            return;
        }
        var docs = collectDocs(), d, found = false;
        for (d = 0; d < docs.length; d++) {
            var b = findBest(docs[d]);
            if (!b) continue;
            found = true;
            window.__dpfLastMatch = describe(b.el) + ' [' + b.kw + '] len=' + b.len;
            if (b.len > DETAIL_TEXT_LEN) {
                // schermata di dettaglio: esci, poi nascondi in fallback
                if (!clickBackIn(docs[d])) hide(b.el);
            } else {
                // riga di lista: nascondi la riga
                hideRow(b.el);
            }
            window.__dpfCount = (window.__dpfCount || 0) + 1;
        }
        window.__dpfFound = found;
        updateStatus();
    }

    function installObservers() {
        var docs = collectDocs(), d;
        var Obs = window.MutationObserver || window.WebKitMutationObserver;
        if (!Obs) return;
        for (d = 0; d < docs.length; d++) {
            (function (doc) {
                if (!doc.__dpfObserved) {
                    try {
                        var mo = new Obs(function () {
                            setTimeout(process, 60);
                        });
                        mo.observe(doc.body || doc.documentElement, {childList: true, subtree: true});
                        doc.__dpfObserved = true;
                    } catch (e) {
                    }
                }
            })(docs[d]);
        }
    }

    function installFilter() {
        if (window.__dpfInstalled) return;
        window.__dpfInstalled = true;
        if (window.__dpfOn === undefined) window.__dpfOn = true;
        window.__dpfSweep = setInterval(function () {
            installObservers(); // gli iframe possono comparire dopo
            process();
        }, SWEEP_MS);
        installObservers();
        process();
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
        xssLog(view, 'cerco e rimuovo l\'avviso ora...', 'xss-hint');
        process();
        xssLog(view, 'documenti trovati: ' + (window.__dpfDocCount || 0));
        xssLog(view, 'trovato: ' + (window.__dpfFound ? 'SI' : 'NO'));
        xssLog(view, 'match: ' + (window.__dpfLastMatch || '(nessuno)'), 'xss-cmd');
    }

    function showInfo(view) {
        xssLog(view, 'remove: ' + (window.__dpfOn ? 'ON' : 'OFF') + ' | azioni: ' + (window.__dpfCount || 0));
        xssLog(view, 'documenti (iframe inclusi): ' + (window.__dpfDocCount || 0));
        xssLog(view, 'ultimo match:', 'xss-hint');
        xssLog(view, window.__dpfLastMatch || '(nessuno)', 'xss-cmd');
        xssLog(view, 'ultima riga nascosta:', 'xss-hint');
        xssLog(view, window.__dpfLastHidden || '(nessuna)', 'xss-cmd');
        xssLog(view, 'back cliccato:', 'xss-hint');
        xssLog(view, window.__dpfBackHit || '(nessuno)', 'xss-cmd');
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
            installFilter();
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
        installFilter();
    }

})(document, window, window.framework, window.log);
