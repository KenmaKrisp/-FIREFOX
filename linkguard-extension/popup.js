const SETTINGS = {
  mode: {
    key: "linkguardSensitivity",
    defaultValue: "links",
    label: (value) =>
      value === "all-links" ? "Все ссылки" : "Только внешние ссылки"
  },
  ui: {
    key: "linkguardUiPreset",
    defaultValue: "full",
    label: (value) => {
      switch (value) {
        case "minimal":
          return "Минималистичный вид";
        case "balanced":
          return "Стандартный вид";
        case "full":
        default:
          return "Полная панель";
      }
    }
  }
};

const statusEl = document.getElementById("status");
const groups = document.querySelectorAll("[data-setting]");

init();

function init() {
  const keys = Object.values(SETTINGS).map((setting) => setting.key);

  browser.storage.local
    .get(keys)
    .then((stored) => {
      groups.forEach((group) => {
        const type = group.dataset.setting;
        const setting = SETTINGS[type];
        if (!setting) return;

        const value = stored[setting.key] || setting.defaultValue;
        const input = group.querySelector(`input[value="${value}"]`);
        if (input) {
          input.checked = true;
        }
      });

      setStatus("Настройки загружены");
    })
    .catch(() => {
      setStatus("Не удалось прочитать настройки");
    });

  groups.forEach((group) => {
    group.addEventListener("change", handleChange);
  });
}

function handleChange(event) {
  const input = event.target;
  const group = input.closest("[data-setting]");
  if (!group || !input || !input.value) return;

  const type = group.dataset.setting;
  const setting = SETTINGS[type];
  if (!setting) return;

  setStatus("Сохраняем…");

  browser.storage.local
    .set({ [setting.key]: input.value })
    .then(() => {
      setStatus(`${setting.label(input.value)} (активно)`);
    })
    .catch(() => {
      setStatus("Не удалось сохранить");
    });
}

function setStatus(text) {
  statusEl.textContent = text;
}
