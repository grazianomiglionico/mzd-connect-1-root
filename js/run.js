(function (document, window, framework, log) {
    function xssLog(view, msg, className) {
        var msgBox = document.createElement("div");
        msgBox.className = className
        msgBox.innerHTML = msg
        view.appendChild(msgBox)
    }

    // Numero della voce "speed toggle" nella lista "choose a script to run"
    // della JCI test mode: e' lo sblocco del touch. Qui e' la 2a voce (testId 2);
    // se non fosse quella giusta cambia il numero (il terminale e' la voce 11).
    var SPEED_TOGGLE_TEST_ID = 2;
    // testId della voce "terminal" (gia' noto in questo progetto).
    var TERMINAL_TEST_ID = 11;
    // Attesa tra lo script "speed toggle" e l'apertura del terminale allo startup.
    // Se il terminale non si apre, aumenta questo valore (lo script deve prima
    // tornare alla lista "choose a script to run").
    var TOUCH_UNLOCK_TO_TERMINAL_MS = 5000;

    // Entra in JCI test mode (Diagnostics -> ActivateJCITest), poi esegue onReady().
    function enterJciTest(view, onReady) {
        xssLog(view, 'JCI test mode ~14sec...')
        framework.sendEventToMmui("syssettings", "SelectDiagnostics")
        setTimeout(function () {
            framework.sendEventToMmui("diag", "ActivateJCITest")
            xssLog(view, 'ActivateJCITest')
            setTimeout(function () {
                onReady()
            }, 7000)
        }, 7000)
    }

    // Esegue una voce di "choose a script to run" tramite il suo testId.
    function runScript(view, testId, label) {
        framework.sendEventToMmui("diag", "ReadDTC", {"payload": {"testId": testId}})
        xssLog(view, 'run script testId ' + testId + ' (' + label + ')')
    }

    function terminal(view) {
        xssLog(view, 'opening terminal ~20sec')
        framework.sendEventToMmui("syssettings", "SelectDiagnostics")
        setTimeout(function () {
            framework.sendEventToMmui("diag", "ActivateJCITest")
            xssLog(view, 'ActivateJCITest')
            setTimeout(function () {
                framework.sendEventToMmui("diag", "ReadDTC", {"payload": {"testId": 11}})
                xssLog(view, 'activate test 11 ReadDTC')
            }, 7000)
        }, 7000)
    }

    // Sblocco del touch: in JCI test mode esegue lo script "speed toggle".
    function touchUnlock(view) {
        if (SPEED_TOGGLE_TEST_ID == null) {
            xssLog(view, 'touch unlock: imposta SPEED_TOGGLE_TEST_ID in run.js')
            return
        }
        enterJciTest(view, function () {
            runScript(view, SPEED_TOGGLE_TEST_ID, 'speed toggle (touch unlock)')
        })
    }

    function UIxssLog(view) {

        if (!log.xsspatched) {
            var UIXssLogWrapper = document.createElement("div");
            UIXssLogWrapper.className = 'xss-wrapper xss-ui-logger'
            log.xsspatched = true
            var originLogError = log.error
            log.error = function (msg) {
                xssLog(UIXssLogWrapper, msg, 'xss-ui-logger_error')
                originLogError(msg)
            }.bind(log)
            var originLogWarn = log.warn
            log.warn = function (msg) {
                xssLog(UIXssLogWrapper, msg, 'xss-ui-logger_warn')
                originLogWarn(msg)
            }.bind(log)
            var originLogInfo = log.info
            log.info = function (msg) {
                xssLog(UIXssLogWrapper, msg, 'xss-ui-logger_info')
                originLogInfo(msg)
            }.bind(log)

            window.document.body.appendChild(UIXssLogWrapper)
            xssLog(view, 'enable UI logs')
        }
    }

    function restart(view) {
        xssLog(view, 'restart....')
        framework._showFatalErrorWink('reboot', 'xss')
        framework._restartCMU('XSS')
    }

    function xssDestroy() {
        window.xssMounted = false
        window.XSSwrapper.remove()
        window.XSStoggle.remove()
    }

    function setXSSRegion(view) {
        framework.localize._currentRegion = 'Region_Europe'
        xssLog(view, 'region Region_Europe')
    }

    function action(parent, name, cb, view) {
        var xActionBtn = document.createElement("div");
        xActionBtn.innerHTML = name
        xActionBtn.className = 'xss-action'
        xActionBtn.addEventListener('mousedown', function () {
            view.innerHTML = ""
            cb(view)
        }, false);
        parent.appendChild(xActionBtn)
    }

    function createMenu() {
        var XSSwrapper = document.createElement("div");
        XSSwrapper.className = 'xss-wrapper'
        var XSSactions = document.createElement("div");
        XSSactions.className = 'xss-actions'
        var view = document.createElement("div");
        view.className = 'xss-view'
        XSSwrapper.appendChild(XSSactions)
        XSSwrapper.appendChild(view)

        action(XSSactions, 'Touch unlock', touchUnlock, view)
        action(XSSactions, 'Open terminal', terminal, view)
        action(XSSactions, 'Ui logs', UIxssLog, view)
        action(XSSactions, 'Set UI region: EU', setXSSRegion, view)
        action(XSSactions, 'Restart', restart, view)
        action(XSSactions, 'Destroy', xssDestroy, view)

        return XSSwrapper;

    }

    function mount() {
        var wrapper = createMenu()


        var toggle = document.createElement("div");
        toggle.innerHTML = "^";
        toggle.className = 'xss-toggle'
        toggle.addEventListener('mousedown', function () {
            window.XSSwrapper.classList.toggle('xss-collapse')
        }, false);
        window.document.body.appendChild(toggle)

        window.document.body.appendChild(wrapper)
        window.xssMounted = true
        window.XSSwrapper = wrapper
        window.XSStoggle = toggle
    }


    function getStartupView() {
        if (window.XSSwrapper) {
            var existing = window.XSSwrapper.querySelector('.xss-view')
            if (existing) {
                existing.innerHTML = ""
                return existing
            }
        }
        return window.document.body
    }

    // Sequenza automatica allo startup: una sola JCI test mode, poi "speed toggle"
    // (sblocco touch) e infine il terminale, nella stessa sessione (come il flusso
    // manuale "choose a script to run").
    function autoStart() {
        var view = getStartupView()
        enterJciTest(view, function () {
            if (SPEED_TOGGLE_TEST_ID != null) {
                runScript(view, SPEED_TOGGLE_TEST_ID, 'speed toggle (touch unlock)')
            } else {
                xssLog(view, 'touch unlock saltato: SPEED_TOGGLE_TEST_ID non impostato')
            }
            setTimeout(function () {
                runScript(view, TERMINAL_TEST_ID, 'terminal')
            }, TOUCH_UNLOCK_TO_TERMINAL_MS)
        })
    }

    var isDevXss = !window.document.body
    if (isDevXss) {
        if (!window.framework) {
            var framework = {}
            framework.sendEventToMmui = function () {
            };
        }
        if (!window.log) {
            var log = {
                error: function (msg) {
                },
                warn: function (msg) {
                },
                info: function (msg) {
                }
            }
        }
        window.onload = function run() {
            mount()
            window.xssCssReady = true
        }
    } else {
        if (!window.xssCssReady) {
            utility.loadCss('../../../mnt/sda1/css/init.css')
            utility.loadCss('../../../mnt/sdb1/css/init.css')
            utility.loadCss('../../../mnt/sdc1/css/init.css')
            utility.loadCss('../../../mnt/sdd1/css/init.css')
            window.xssCssReady = true
        }
        if (!window.xssMounted) {
            mount()
        }
        if (!window.xssAutoStarted) {
            window.xssAutoStarted = true
            autoStart()
        }
    }

})(document, window, window.framework, window.log);
