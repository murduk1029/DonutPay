(function () {
  const page = document.body.dataset.page;
  const db = createDatabase();
  const language = createLanguageManager(db);
  language.applyPage(page);
  setupLanguageToggle();

  if (page === "landing") initLandingPage();
  if (page === "auth") initAuthPage();
  if (page === "dashboard") initDashboardPage();
  if (page === "donate") initDonatePage();

  function setupLanguageToggle() {
    const button = document.getElementById("languageToggleBtn");
    if (!button) return;
    button.textContent = db.getLanguage().toUpperCase();
    button.addEventListener("click", () => {
      const next = db.cycleLanguage();
      button.textContent = next.toUpperCase();
      language.applyPage(page);
    });
  }

  function initLandingPage() {
    const session = db.getCurrentUser();
    const dashboardBtn = document.getElementById("goDashboardBtn");
    if (session && dashboardBtn) dashboardBtn.classList.remove("hidden");
  }

  function initAuthPage() {
    const session = db.getCurrentUser();
    if (session) {
      window.location.href = "dashboard.html";
      return;
    }

    const loginTabBtn = document.getElementById("loginTabBtn");
    const registerTabBtn = document.getElementById("registerTabBtn");
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const authStatus = document.getElementById("authStatus");
    const redirectTarget = new URLSearchParams(window.location.search).get("redirect");
    const openRegister = window.location.hash === "#register";

    setTab(openRegister ? "register" : "login");

    loginTabBtn.addEventListener("click", () => setTab("login"));
    registerTabBtn.addEventListener("click", () => setTab("register"));

    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const nickname = getValue("loginNickname");
      const password = getRawValue("loginPassword");
      const user = db.validateUser(nickname, password);
      if (!user) {
        return setStatus("Невірний нікнейм або пароль.", true);
      }

      db.setCurrentUser({ nickname: user.nickname });
      setStatus("Вхід успішний. Переходимо в кабінет...", false);
      setTimeout(() => {
        window.location.href = redirectTarget || "dashboard.html";
      }, 500);
    });

    registerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const nickname = getValue("registerNickname");
      const password = getRawValue("registerPassword");
      if (!/^[a-z0-9_]{3,24}$/i.test(nickname)) {
        return setStatus("Нікнейм має містити 3-24 символи: латиниця, цифри або _.", true);
      }
      if (password.length < 6) {
        return setStatus("Пароль має містити щонайменше 6 символів.", true);
      }
      const result = db.createUser(nickname, password);
      if (!result.ok) return setStatus(result.message, true);

      db.setCurrentUser({ nickname: result.user.nickname });
      setStatus("Реєстрація успішна. Ви автоматично увійшли.", false);
      setTimeout(() => {
        window.location.href = redirectTarget || "dashboard.html";
      }, 500);
    });

    function setTab(tab) {
      const isLogin = tab === "login";
      loginTabBtn.classList.toggle("active", isLogin);
      registerTabBtn.classList.toggle("active", !isLogin);
      loginForm.classList.toggle("hidden", !isLogin);
      registerForm.classList.toggle("hidden", isLogin);
      authStatus.textContent = "";
    }

    function setStatus(message, isError) {
      authStatus.textContent = message;
      authStatus.style.color = isError ? "#ffb6ca" : "#9dffd8";
    }
  }

  function initDashboardPage() {
    const session = db.getCurrentUser();
    if (!session) {
      window.location.href = "auth.html?redirect=dashboard.html";
      return;
    }
    const user = db.findUser(session.nickname);
    if (!user) {
      db.clearSession();
      window.location.href = "auth.html";
      return;
    }

    const ui = mapDashboardElements();
    let filter = "all";
    let previewEnabled = false;
    let previewLastSeenId = 0;

    ui.profileNickname.textContent = user.nickname;
    ui.profileAvatar.textContent = makeInitials(user.nickname);
    ui.profileBio.value = user.bio || "";
    ui.pinnedMessageInput.value = user.pinnedMessage || "";
    ui.telegramInput.value = user.telegram || "";
    ui.gifStyleSelect.value = user.alertGifStyle || "auto";
    ui.soundStyleSelect.value = user.alertSoundStyle || "chime";
    ui.goalAmountInput.value = String(user.goalAmount || 10000);

    ui.donationLinkInput.value = `${window.location.origin}${window.location.pathname.replace(
      "dashboard.html",
      "donate.html"
    )}?user=${encodeURIComponent(user.nickname)}`;

    renderAll();
    bindEvents();

    function bindEvents() {
      ui.logoutBtn.addEventListener("click", () => {
        db.clearSession();
        window.location.href = "index.html";
      });

      ui.copyLinkBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(ui.donationLinkInput.value);
          ui.copyStatus.textContent = "Посилання скопійовано.";
        } catch (error) {
          ui.copyStatus.textContent = "Не вдалося скопіювати посилання.";
        }
      });

      ui.profileForm.addEventListener("submit", (event) => {
        event.preventDefault();
        db.updateUser(user.nickname, {
          bio: ui.profileBio.value.trim(),
          pinnedMessage: ui.pinnedMessageInput.value.trim(),
          telegram: ui.telegramInput.value.trim(),
        });
        ui.profileStatus.textContent = "Профіль оновлено.";
      });

      ui.goalForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const goal = Number(ui.goalAmountInput.value);
        if (Number.isNaN(goal) || goal < 100) {
          ui.goalStatus.textContent = "Вкажіть коректну суму цілі (від 100 грн).";
          return;
        }
        db.updateUser(user.nickname, { goalAmount: Math.floor(goal) });
        ui.goalStatus.textContent = "Ціль оновлено.";
        renderGoal();
      });

      ui.alertSettingsForm.addEventListener("submit", (event) => {
        event.preventDefault();
        db.updateUser(user.nickname, {
          alertGifStyle: ui.gifStyleSelect.value,
          alertSoundStyle: ui.soundStyleSelect.value,
        });
        ui.alertSettingsStatus.textContent = "Налаштування алертів збережено.";
      });

      ui.testSoundBtn.addEventListener("click", () => {
        playAlertSound(ui.soundStyleSelect.value);
        ui.alertSettingsStatus.textContent = "Тест звуку завершено.";
      });

      ui.themeToggleBtn.addEventListener("click", () => {
        const mode = db.toggleTheme();
        applyTheme(mode);
      });

      ui.filterButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          filter = btn.dataset.filter;
          ui.filterButtons.forEach((item) => item.classList.remove("active"));
          btn.classList.add("active");
          renderHistory();
        });
      });

      ui.exportJsonBtn.addEventListener("click", () => {
        const donations = getFilteredDonations();
        downloadFile(`${user.nickname}-donations.json`, JSON.stringify(donations, null, 2), "application/json");
      });

      ui.exportCsvBtn.addEventListener("click", () => {
        const donations = getFilteredDonations();
        const csvLines = [
          "donorName,donorNickname,amount,message,createdAt",
          ...donations.map((d) =>
            [csvEscape(d.donorName), csvEscape(d.donorNickname), d.amount, csvEscape(d.message), d.createdAt].join(",")
          ),
        ];
        downloadFile(`${user.nickname}-donations.csv`, csvLines.join("\n"), "text/csv;charset=utf-8");
      });

      ui.toggleInlinePreviewBtn.addEventListener("click", () => {
        previewEnabled = !previewEnabled;
        ui.toggleInlinePreviewBtn.textContent = previewEnabled ? "Вимкнути прев'ю" : "Увімкнути прев'ю";
        ui.inlinePreviewStatus.textContent = previewEnabled
          ? "Прев'ю увімкнено. Очікування нових донатів..."
          : "Прев'ю вимкнено.";
      });

      ui.backupAllBtn.addEventListener("click", () => {
        const backup = db.getAllData();
        downloadFile("donutpay-backup.json", JSON.stringify(backup, null, 2), "application/json");
        ui.backupStatus.textContent = "Резервну копію експортовано.";
      });

      ui.restoreAllBtn.addEventListener("click", () => ui.restoreFileInput.click());
      ui.restoreFileInput.addEventListener("change", async () => {
        const file = ui.restoreFileInput.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          db.restoreAllData(data);
          ui.backupStatus.textContent = "Дані успішно відновлено. Оновіть сторінку.";
        } catch (error) {
          ui.backupStatus.textContent = "Не вдалося відновити дані з файлу.";
        }
      });

      ui.resetMyDataBtn.addEventListener("click", () => {
        db.clearUserDonations(user.nickname);
        renderAll();
        ui.backupStatus.textContent = "Ваші донати очищено.";
      });
    }

    setInterval(() => {
      if (!previewEnabled) return;
      const events = db.getAlertEvents(user.nickname);
      const event = events.find((item) => item.id > previewLastSeenId);
      if (!event) return;

      previewLastSeenId = event.id;
      ui.inlinePreviewGif.src = getGifByStyle(event.gifStyle, event.amount);
      ui.inlinePreviewDonor.textContent = event.donorName || event.donorNickname;
      ui.inlinePreviewAmount.textContent = `${event.amount} ₴`;
      ui.inlinePreviewMessage.textContent = event.message;
      ui.inlinePreviewAlert.classList.remove("hidden");
      playAlertSound(event.soundStyle);

      setTimeout(() => ui.inlinePreviewAlert.classList.add("hidden"), 4500);
    }, 1000);

    function renderAll() {
      applyTheme(db.getTheme());
      renderStats();
      renderGoal();
      renderHistory();
      renderTopDonors();
    }

    function getFilteredDonations() {
      const donations = db.getDonationsByUser(user.nickname);
      return filterDonations(donations, filter);
    }

    function renderStats() {
      const donations = db.getDonationsByUser(user.nickname);
      const total = donations.reduce((sum, item) => sum + item.amount, 0);
      const donorsSet = new Set(donations.map((item) => item.donorNickname));
      ui.totalDonationsAmount.textContent = `${total} ₴`;
      ui.totalDonorsCount.textContent = String(donorsSet.size);
      ui.latestDonationText.textContent = donations.length
        ? `${donations[0].donorName || donations[0].donorNickname}: ${donations[0].amount} ₴`
        : "Ще немає";
    }

    function renderGoal() {
      const currentUser = db.findUser(user.nickname);
      const donations = db.getDonationsByUser(user.nickname);
      const total = donations.reduce((sum, item) => sum + item.amount, 0);
      const goal = Number(currentUser.goalAmount || 10000);
      const progress = Math.min(100, Math.round((total / goal) * 100));
      ui.goalProgressBar.style.width = `${progress}%`;
      ui.goalProgressText.textContent = `${total} / ${goal} грн (${progress}%)`;
    }

    function renderHistory() {
      const donations = getFilteredDonations();
      ui.donationsList.innerHTML = "";
      ui.emptyDonations.classList.toggle("hidden", donations.length > 0);
      donations.forEach((donation) => {
        const card = document.createElement("li");
        card.className = "donation-item";
        card.innerHTML = `
          <div class="donation-item-header">
            <span class="donation-item-name">${escapeHtml(donation.donorName || donation.donorNickname)}</span>
            <span class="donation-item-amount">${donation.amount} ₴</span>
          </div>
          <p class="donation-item-message">${escapeHtml(donation.message)}</p>
          <small>${formatDate(donation.createdAt)}</small>
        `;
        ui.donationsList.appendChild(card);
      });
    }

    function renderTopDonors() {
      const donations = db.getDonationsByUser(user.nickname);
      const grouped = {};
      donations.forEach((item) => {
        const key = item.donorNickname;
        grouped[key] = (grouped[key] || 0) + item.amount;
      });
      const top = Object.entries(grouped)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      ui.topDonorsList.innerHTML = "";
      ui.emptyTopDonors.classList.toggle("hidden", top.length > 0);
      top.forEach((entry, index) => {
        const li = document.createElement("li");
        li.className = "donation-item";
        li.innerHTML = `
          <div class="donation-item-header">
            <span class="donation-item-name">#${index + 1} ${escapeHtml(entry.name)}</span>
            <span class="donation-item-amount">${entry.total} ₴</span>
          </div>
        `;
        ui.topDonorsList.appendChild(li);
      });
    }
  }

  function initDonatePage() {
    const ui = mapDonateElements();
    const receiverNickname = normalizeNickname(new URLSearchParams(window.location.search).get("user"));
    const receiver = db.findUser(receiverNickname);
    if (!receiver) {
      ui.recipientNickname.textContent = "профіль не знайдено";
      ui.recipientInfo.textContent = "Перевірте правильність посилання.";
      ui.donationForm.classList.add("hidden");
      return;
    }

    ui.recipientNickname.textContent = receiver.nickname;
    ui.recipientInfo.textContent = receiver.bio || "Стрімер поки не додав опис профілю.";
    if (receiver.pinnedMessage) {
      ui.recipientPinnedMessage.classList.remove("hidden");
      ui.recipientPinnedMessage.textContent = `📌 ${receiver.pinnedMessage}`;
    }
    if (receiver.telegram) {
      ui.recipientSocialRow.classList.remove("hidden");
      ui.recipientTelegramLink.href = receiver.telegram;
    }

    updateAuthHint();
    renderRecentDonations();

    ui.donationForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const session = db.getCurrentUser();
      if (!session) {
        ui.donationStatus.innerHTML =
          `Щоб надіслати донат, потрібно <a href="auth.html?redirect=${encodeURIComponent(
            window.location.pathname + window.location.search
          )}">увійти</a>.`;
        return;
      }

      const donorName = getValue("donorName");
      const amount = Number(getRawValue("donationAmount"));
      const message = getValue("donationMessage");
      if (!donorName || !message || Number.isNaN(amount) || amount <= 0) {
        ui.donationStatus.textContent = "Заповніть усі поля коректно.";
        return;
      }

      ui.donationSubmitBtn.disabled = true;
      ui.donationSubmitBtn.textContent = "Обробка...";
      ui.donationStatus.textContent = "Оплата обробляється...";

      const gifStyle = receiver.alertGifStyle || "auto";
      const gifUrl = await getGifUrl(gifStyle, amount);
      const soundStyle = receiver.alertSoundStyle || "chime";

      setTimeout(() => {
        const donation = {
          id: Date.now(),
          donorName,
          donorNickname: session.nickname,
          amount: Math.floor(amount),
          message,
          createdAt: new Date().toISOString(),
        };

        db.addDonation(receiver.nickname, donation);
        db.addAlertEvent(receiver.nickname, {
          donorName,
          donorNickname: session.nickname,
          amount: donation.amount,
          message,
          gifStyle,
          gifUrl,
          soundStyle,
        });

        ui.donationForm.reset();
        ui.donationSubmitBtn.disabled = false;
        ui.donationSubmitBtn.textContent = "Надіслати донат";
        ui.donationStatus.textContent = "Донат успішно надіслано!";
        ui.successPopup.classList.remove("hidden");
        setTimeout(() => ui.successPopup.classList.add("hidden"), 1700);
        showFullscreenAlert({
          donorName,
          amount: donation.amount,
          message,
          gifUrl,
          soundStyle,
        });
        renderRecentDonations();
      }, 900);
    });

    function updateAuthHint() {
      const session = db.getCurrentUser();
      if (!session) {
        ui.donateAuthHint.textContent = "Щоб надсилати донати, потрібно увійти в акаунт.";
      } else {
        ui.donateAuthHint.textContent = `Ви авторизовані як ${session.nickname}.`;
        ui.donorName.value = session.nickname;
      }
    }

    function renderRecentDonations() {
      const donations = db.getDonationsByUser(receiver.nickname).slice(0, 12);
      ui.recipientDonationsList.innerHTML = "";
      ui.recipientEmptyState.classList.toggle("hidden", donations.length > 0);
      donations.forEach((item) => {
        const li = document.createElement("li");
        li.className = "donation-item";
        li.innerHTML = `
          <div class="donation-item-header">
            <span class="donation-item-name">${escapeHtml(item.donorName || item.donorNickname)}</span>
            <span class="donation-item-amount">${item.amount} ₴</span>
          </div>
          <p class="donation-item-message">${escapeHtml(item.message)}</p>
          <small>${formatDate(item.createdAt)}</small>
        `;
        ui.recipientDonationsList.appendChild(li);
      });
    }

    function showFullscreenAlert(alertData) {
      ui.alertGif.src = alertData.gifUrl || getFallbackGif(alertData.amount);
      ui.alertDonor.textContent = alertData.donorName;
      ui.alertAmount.textContent = `${alertData.amount} ₴`;
      ui.alertMessage.textContent = alertData.message;
      ui.fullscreenAlert.classList.remove("hidden");
      playAlertSound(alertData.soundStyle);
      setTimeout(() => ui.fullscreenAlert.classList.add("hidden"), 4200);
    }
  }

  function createDatabase() {
    const KEYS = {
      users: "users",
      currentUser: "currentUser",
      donations: "donations",
      alertEvents: "alert_events",
      uiTheme: "ui_theme",
      uiLanguage: "ui_language",
    };

    function read(key, fallback) {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      try {
        return JSON.parse(raw);
      } catch (error) {
        return fallback;
      }
    }

    function write(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }

    function getUsers() {
      return read(KEYS.users, []);
    }

    function setUsers(users) {
      write(KEYS.users, users);
    }

    function getDonationsMap() {
      return read(KEYS.donations, {});
    }

    return {
      getAllData() {
        return {
          users: getUsers(),
          currentUser: read(KEYS.currentUser, null),
          donations: getDonationsMap(),
          alertEvents: read(KEYS.alertEvents, []),
          uiTheme: this.getTheme(),
        };
      },
      restoreAllData(data) {
        if (!data || typeof data !== "object") throw new Error("invalid");
        write(KEYS.users, Array.isArray(data.users) ? data.users : []);
        write(KEYS.currentUser, data.currentUser || null);
        write(KEYS.donations, data.donations || {});
        write(KEYS.alertEvents, Array.isArray(data.alertEvents) ? data.alertEvents : []);
        write(KEYS.uiTheme, data.uiTheme || "dark");
      },
      createUser(nickname, password) {
        const clean = normalizeNickname(nickname);
        const users = getUsers();
        if (users.some((u) => u.nickname === clean)) {
          return { ok: false, message: "Такий нікнейм вже існує." };
        }
        const user = {
          nickname: clean,
          password,
          bio: "",
          goalAmount: 10000,
          pinnedMessage: "",
          telegram: "",
          alertGifStyle: "auto",
          alertSoundStyle: "chime",
          createdAt: new Date().toISOString(),
        };
        users.push(user);
        setUsers(users);
        return { ok: true, user };
      },
      validateUser(nickname, password) {
        const clean = normalizeNickname(nickname);
        return getUsers().find((u) => u.nickname === clean && u.password === password) || null;
      },
      findUser(nickname) {
        const clean = normalizeNickname(nickname);
        return getUsers().find((u) => u.nickname === clean) || null;
      },
      updateUser(nickname, patch) {
        const clean = normalizeNickname(nickname);
        const users = getUsers();
        const index = users.findIndex((u) => u.nickname === clean);
        if (index === -1) return false;
        users[index] = { ...users[index], ...patch };
        setUsers(users);
        return true;
      },
      setCurrentUser(user) {
        write(KEYS.currentUser, user);
      },
      getCurrentUser() {
        return read(KEYS.currentUser, null);
      },
      clearSession() {
        localStorage.removeItem(KEYS.currentUser);
      },
      addDonation(receiverNickname, donation) {
        const donations = getDonationsMap();
        const key = normalizeNickname(receiverNickname);
        donations[key] = donations[key] || [];
        donations[key].unshift(donation);
        write(KEYS.donations, donations);
      },
      getDonationsByUser(nickname) {
        const key = normalizeNickname(nickname);
        return getDonationsMap()[key] || [];
      },
      clearUserDonations(nickname) {
        const donations = getDonationsMap();
        donations[normalizeNickname(nickname)] = [];
        write(KEYS.donations, donations);
      },
      addAlertEvent(receiverNickname, eventData) {
        const events = read(KEYS.alertEvents, []);
        events.unshift({
          id: Date.now(),
          receiverNickname: normalizeNickname(receiverNickname),
          ...eventData,
        });
        write(KEYS.alertEvents, events.slice(0, 500));
      },
      getAlertEvents(nickname) {
        const clean = normalizeNickname(nickname);
        return read(KEYS.alertEvents, []).filter((item) => item.receiverNickname === clean);
      },
      getTheme() {
        return read(KEYS.uiTheme, "dark");
      },
      toggleTheme() {
        const next = this.getTheme() === "dark" ? "light" : "dark";
        write(KEYS.uiTheme, next);
        return next;
      },
      getLanguage() {
        return read(KEYS.uiLanguage, "uk");
      },
      setLanguage(language) {
        write(KEYS.uiLanguage, language);
      },
      cycleLanguage() {
        const current = this.getLanguage();
        const order = ["uk", "ru", "en"];
        const next = order[(order.indexOf(current) + 1) % order.length];
        this.setLanguage(next);
        return next;
      },
    };
  }

  function createLanguageManager(dbApi) {
    const dictionaries = {
      uk: {
        titleLanding: "DonutPay — Сервіс для донатів стрімерам",
        titleAuth: "DonutPay — Вхід та реєстрація",
        titleDashboard: "DonutPay — Особистий кабінет",
        titleDonate: "DonutPay — Сторінка донату",
      },
      ru: {
        titleLanding: "DonutPay — Сервис для донатов стримерам",
        titleAuth: "DonutPay — Вход и регистрация",
        titleDashboard: "DonutPay — Личный кабинет",
        titleDonate: "DonutPay — Страница доната",
      },
      en: {
        titleLanding: "DonutPay — Donation platform for streamers",
        titleAuth: "DonutPay — Login and registration",
        titleDashboard: "DonutPay — Dashboard",
        titleDonate: "DonutPay — Donation page",
      },
    };

    const textMaps = {
      landing: {
        uk: [
          ["a[href='auth.html']", "Увійти"],
          ["a[href='auth.html#register']", "Зареєструватися"],
          [".subtitle", "Сервіс для донатів стрімерам та креаторам"],
          [".hero-buttons .btn.btn-gradient", "Почати зараз"],
          ["footer .footer-links a[href='auth.html']", "Увійти"],
          ["footer .footer-links a[href='dashboard.html']", "Кабінет"],
        ],
        ru: [
          ["a[href='auth.html']", "Войти"],
          ["a[href='auth.html#register']", "Зарегистрироваться"],
          [".subtitle", "Сервис для донатов стримерам и креаторам"],
          [".hero-buttons .btn.btn-gradient", "Начать сейчас"],
          ["footer .footer-links a[href='auth.html']", "Войти"],
          ["footer .footer-links a[href='dashboard.html']", "Кабинет"],
        ],
        en: [
          ["a[href='auth.html']", "Sign in"],
          ["a[href='auth.html#register']", "Sign up"],
          [".subtitle", "Donation service for streamers and creators"],
          [".hero-buttons .btn.btn-gradient", "Get started"],
          ["footer .footer-links a[href='auth.html']", "Sign in"],
          ["footer .footer-links a[href='dashboard.html']", "Dashboard"],
        ],
      },
      auth: {
        uk: [
          [".topbar-actions a[href='index.html']", "На головну"],
          ["#loginTabBtn", "Вхід"],
          ["#registerTabBtn", "Реєстрація"],
          ["#loginForm h2", "Увійти в DonutPay"],
          ["#registerForm h2", "Створити акаунт"],
          ["#loginForm button[type='submit']", "Увійти"],
          ["#registerForm button[type='submit']", "Зареєструватися"],
        ],
        ru: [
          [".topbar-actions a[href='index.html']", "На главную"],
          ["#loginTabBtn", "Вход"],
          ["#registerTabBtn", "Регистрация"],
          ["#loginForm h2", "Войти в DonutPay"],
          ["#registerForm h2", "Создать аккаунт"],
          ["#loginForm button[type='submit']", "Войти"],
          ["#registerForm button[type='submit']", "Зарегистрироваться"],
        ],
        en: [
          [".topbar-actions a[href='index.html']", "Home"],
          ["#loginTabBtn", "Login"],
          ["#registerTabBtn", "Register"],
          ["#loginForm h2", "Login to DonutPay"],
          ["#registerForm h2", "Create account"],
          ["#loginForm button[type='submit']", "Login"],
          ["#registerForm button[type='submit']", "Register"],
        ],
      },
      dashboard: {
        uk: [["#logoutBtn", "Вийти"], ["#themeToggleBtn", "Змінити тему"]],
        ru: [["#logoutBtn", "Выйти"], ["#themeToggleBtn", "Сменить тему"]],
        en: [["#logoutBtn", "Logout"], ["#themeToggleBtn", "Toggle theme"]],
      },
      donate: {
        uk: [
          [".topbar-actions a[href='index.html']", "Головна"],
          [".topbar-actions a[href='dashboard.html']", "Мій кабінет"],
          ["#donationSubmitBtn", "Надіслати донат"],
          ["#donateAuthHint", "Щоб надсилати донати, потрібно увійти в акаунт."],
        ],
        ru: [
          [".topbar-actions a[href='index.html']", "Главная"],
          [".topbar-actions a[href='dashboard.html']", "Мой кабинет"],
          ["#donationSubmitBtn", "Отправить донат"],
          ["#donateAuthHint", "Чтобы отправлять донаты, нужно войти в аккаунт."],
        ],
        en: [
          [".topbar-actions a[href='index.html']", "Home"],
          [".topbar-actions a[href='dashboard.html']", "My dashboard"],
          ["#donationSubmitBtn", "Send donation"],
          ["#donateAuthHint", "You need to login to send donations."],
        ],
      },
    };

    function applyPage(currentPage) {
      const current = dbApi.getLanguage();
      document.documentElement.lang = current === "uk" ? "uk" : current === "ru" ? "ru" : "en";
      if (currentPage === "landing") document.title = dictionaries[current].titleLanding;
      if (currentPage === "auth") document.title = dictionaries[current].titleAuth;
      if (currentPage === "dashboard") document.title = dictionaries[current].titleDashboard;
      if (currentPage === "donate") document.title = dictionaries[current].titleDonate;

      const map = textMaps[currentPage]?.[current] || [];
      map.forEach(([selector, text]) => {
        const el = document.querySelector(selector);
        if (el) el.textContent = text;
      });

      const toggle = document.getElementById("languageToggleBtn");
      if (toggle) toggle.textContent = current.toUpperCase();
    }

    return { applyPage };
  }

  async function getGifUrl(style, amount) {
    try {
      const tag = style === "auto" ? "donut" : style;
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/random?api_key=dc6zaTOxFJmzC&tag=${encodeURIComponent(tag)}&rating=g`
      );
      const json = await response.json();
      const url = json?.data?.images?.original?.url;
      if (url) return url;
    } catch (error) {
      // Fallback is handled below.
    }
    return getFallbackGif(amount);
  }

  function getFallbackGif(amount) {
    if (amount >= 1000) return "https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif";
    if (amount >= 300) return "https://media.giphy.com/media/3o6Zt6ML6BklcajjsA/giphy.gif";
    return "https://media.giphy.com/media/yoJC2A59OCZHs1LXvW/giphy.gif";
  }

  function getGifByStyle(style, amount) {
    if (style === "hype") return "https://media.giphy.com/media/3o6Zt6ML6BklcajjsA/giphy.gif";
    if (style === "calm") return "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif";
    if (style === "party") return "https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif";
    return getFallbackGif(amount);
  }

  function playAlertSound(style) {
    if (style === "off") return;
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const base = context.currentTime;
    const tones = style === "arcade"
      ? [480, 720, 980]
      : style === "bell"
        ? [860, 1120]
        : [650, 950];

    tones.forEach((freq, idx) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = style === "arcade" ? "square" : "sine";
      osc.frequency.setValueAtTime(freq, base + idx * 0.12);
      gain.gain.setValueAtTime(0.0001, base + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.08, base + idx * 0.12 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, base + idx * 0.12 + 0.18);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(base + idx * 0.12);
      osc.stop(base + idx * 0.12 + 0.2);
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  function mapDashboardElements() {
    return {
      profileNickname: getEl("profileNickname"),
      profileAvatar: getEl("profileAvatar"),
      donationLinkInput: getEl("donationLinkInput"),
      copyLinkBtn: getEl("copyLinkBtn"),
      copyStatus: getEl("copyStatus"),
      profileForm: getEl("profileForm"),
      profileBio: getEl("profileBio"),
      pinnedMessageInput: getEl("pinnedMessageInput"),
      telegramInput: getEl("telegramInput"),
      profileStatus: getEl("profileStatus"),
      logoutBtn: getEl("logoutBtn"),
      totalDonationsAmount: getEl("totalDonationsAmount"),
      totalDonorsCount: getEl("totalDonorsCount"),
      latestDonationText: getEl("latestDonationText"),
      goalForm: getEl("goalForm"),
      goalAmountInput: getEl("goalAmountInput"),
      goalProgressBar: getEl("goalProgressBar"),
      goalProgressText: getEl("goalProgressText"),
      goalStatus: getEl("goalStatus"),
      donationsList: getEl("donationsList"),
      emptyDonations: getEl("emptyDonations"),
      topDonorsList: getEl("topDonorsList"),
      emptyTopDonors: getEl("emptyTopDonors"),
      filterButtons: Array.from(document.querySelectorAll(".filter-btn")),
      exportJsonBtn: getEl("exportJsonBtn"),
      exportCsvBtn: getEl("exportCsvBtn"),
      alertSettingsForm: getEl("alertSettingsForm"),
      gifStyleSelect: getEl("gifStyleSelect"),
      soundStyleSelect: getEl("soundStyleSelect"),
      testSoundBtn: getEl("testSoundBtn"),
      alertSettingsStatus: getEl("alertSettingsStatus"),
      toggleInlinePreviewBtn: getEl("toggleInlinePreviewBtn"),
      inlinePreviewStatus: getEl("inlinePreviewStatus"),
      inlinePreviewAlert: getEl("inlinePreviewAlert"),
      inlinePreviewGif: getEl("inlinePreviewGif"),
      inlinePreviewDonor: getEl("inlinePreviewDonor"),
      inlinePreviewAmount: getEl("inlinePreviewAmount"),
      inlinePreviewMessage: getEl("inlinePreviewMessage"),
      backupAllBtn: getEl("backupAllBtn"),
      restoreAllBtn: getEl("restoreAllBtn"),
      resetMyDataBtn: getEl("resetMyDataBtn"),
      restoreFileInput: getEl("restoreFileInput"),
      backupStatus: getEl("backupStatus"),
      themeToggleBtn: getEl("themeToggleBtn"),
      languageToggleBtn: getEl("languageToggleBtn"),
    };
  }

  function mapDonateElements() {
    return {
      recipientNickname: getEl("recipientNickname"),
      recipientInfo: getEl("recipientInfo"),
      recipientPinnedMessage: getEl("recipientPinnedMessage"),
      recipientSocialRow: getEl("recipientSocialRow"),
      recipientTelegramLink: getEl("recipientTelegramLink"),
      donateAuthHint: getEl("donateAuthHint"),
      donationForm: getEl("donationForm"),
      donorName: getEl("donorName"),
      donationMessage: getEl("donationMessage"),
      donationAmount: getEl("donationAmount"),
      donationSubmitBtn: getEl("donationSubmitBtn"),
      donationStatus: getEl("donationStatus"),
      recipientDonationsList: getEl("recipientDonationsList"),
      recipientEmptyState: getEl("recipientEmptyState"),
      successPopup: getEl("successPopup"),
      fullscreenAlert: getEl("fullscreenAlert"),
      alertGif: getEl("alertGif"),
      alertDonor: getEl("alertDonor"),
      alertAmount: getEl("alertAmount"),
      alertMessage: getEl("alertMessage"),
    };
  }

  function filterDonations(donations, mode) {
    if (mode === "all") return donations;
    const now = new Date();
    return donations.filter((item) => {
      const date = new Date(item.createdAt);
      if (mode === "today") {
        return (
          now.getFullYear() === date.getFullYear() &&
          now.getMonth() === date.getMonth() &&
          now.getDate() === date.getDate()
        );
      }
      if (mode === "7d") {
        const from = new Date();
        from.setDate(from.getDate() - 7);
        return date >= from;
      }
      return true;
    });
  }

  function normalizeNickname(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function getValue(id) {
    return String(getEl(id)?.value || "").trim();
  }

  function getRawValue(id) {
    return String(getEl(id)?.value || "");
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "short" });
  }

  function makeInitials(name) {
    const clean = String(name || "").replace(/[^a-z0-9]/gi, "");
    return (clean.slice(0, 2) || "DP").toUpperCase();
  }

  function csvEscape(value) {
    return `"${String(value || "").replaceAll('"', '""')}"`;
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
