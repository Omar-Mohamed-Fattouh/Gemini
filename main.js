const typingForm = document.querySelector(".typing-form");
const chatList = document.querySelector(".chat-list");
const suggestions = document.querySelectorAll(".suggestion-list .suggestion");
const toggleThemeButton = document.querySelector("#toggle-theme-button");
const deleteChatButton = document.querySelector("#delete-chat-button");
const apiKeyButton = document.querySelector("#api-key-button");
const apiSetup = document.querySelector("#api-setup");
const apiKeyInput = document.querySelector("#api-key-input");
const apiKeySave = document.querySelector("#api-key-save");

let userMessage = null;
let isResponseGenerating = false;
let chatHistory = [];

const DEFAULT_API_KEY = "AIzaSyAmo0hP-ZsWNwgcndk2o1MYRk0598Q0j-I";
const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-flash-latest",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getApiKey = () => localStorage.getItem("geminiApiKey") || DEFAULT_API_KEY;

const hasUserApiKey = () => Boolean(localStorage.getItem("geminiApiKey"));

const showApiSetup = () => {
  apiSetup.hidden = false;
  apiKeyInput.value = localStorage.getItem("geminiApiKey") || "";
  apiKeyInput.focus();
};

const hideApiSetup = () => {
  apiSetup.hidden = true;
};

const requestContent = (model, contents) =>
  fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": getApiKey(),
      },
      body: JSON.stringify({ contents }),
    }
  );

const friendlyError = (message) => {
  if (/quota exceeded|resource exhausted|rate/i.test(message)) {
    return "Gemini is rate-limited right now. Click the key icon, paste a free key from Google AI Studio, then send again.";
  }
  if (/api key|permission|unauthorized|invalid/i.test(message)) {
    return "The Gemini API key is missing or invalid. Click the key icon and paste a key from Google AI Studio.";
  }
  return message;
};

const loadLocalStorageData = () => {
  const savedChats = localStorage.getItem("savedChats");
  const savedHistory = localStorage.getItem("chatHistory");
  const isLightMode = localStorage.getItem("themeColor") === "light_mode";

  document.body.classList.toggle("light_mode", isLightMode);
  toggleThemeButton.innerText = isLightMode ? "dark_mode" : "light_mode";
  chatList.innerHTML = savedChats || "";
  chatList.querySelectorAll(".message.loading").forEach((message) => {
    message.classList.remove("loading");
    const text = message.querySelector(".text");
    if (text && !text.innerText.trim()) {
      message.remove();
    }
  });
  document.body.classList.toggle("hide-header", Boolean(chatList.innerHTML.trim()));
  chatList.scrollTo(0, chatList.scrollHeight);

  try {
    chatHistory = savedHistory ? JSON.parse(savedHistory) : [];
    if (!Array.isArray(chatHistory)) chatHistory = [];
  } catch {
    chatHistory = [];
  }
};

const persistChat = () => {
  localStorage.setItem("savedChats", chatList.innerHTML);
  localStorage.setItem("chatHistory", JSON.stringify(chatHistory));
};

loadLocalStorageData();

const createMessageElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
};

const showTypingEffect = (text, textElement, incomingMessageDiv) => {
  const words = text.split(" ");
  let currentWordIndex = 0;
  const copyIcon = incomingMessageDiv.querySelector(".icon");

  const typingInterval = setInterval(() => {
    textElement.textContent +=
      (currentWordIndex === 0 ? "" : " ") + words[currentWordIndex++];
    copyIcon.classList.add("hide");

    if (currentWordIndex >= words.length) {
      clearInterval(typingInterval);
      isResponseGenerating = false;
      copyIcon.classList.remove("hide");
      persistChat();
    }

    chatList.scrollTo(0, chatList.scrollHeight);
  }, 75);
};

const extractText = (data) => {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .trim();
};

const isNotFound = (status, message) =>
  status === 404 || /not found|not supported/i.test(message);

const isRateLimited = (status, message) =>
  status === 429 ||
  status === 503 ||
  /quota exceeded|resource exhausted|rate|high demand|unavailable|try again later/i.test(
    message
  );

const generateAPIResponse = async (incomingMessageDiv) => {
  const textElement = incomingMessageDiv.querySelector(".text");
  let lastError = null;

  try {
    const contents = [
      ...chatHistory,
      { role: "user", parts: [{ text: userMessage }] },
    ];

    for (const model of MODELS) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await requestContent(model, contents);
        const data = await response.json();
        const message =
          data?.error?.message || `Request failed (${response.status})`;

        if (isRateLimited(response.status, message)) {
          lastError = new Error(message);
          if (attempt === 2) throw lastError;
          const waitMs = 25000 * (attempt + 1);
          textElement.innerText = `Gemini is busy. Retrying in ${waitMs / 1000}s...`;
          textElement.classList.remove("error");
          incomingMessageDiv.classList.remove("loading");
          await sleep(waitMs);
          incomingMessageDiv.classList.add("loading");
          textElement.innerText = "";
          continue;
        }

        if (!response.ok) {
          lastError = new Error(message);
          if (isNotFound(response.status, message)) break;
          throw lastError;
        }

        const apiResponse = extractText(data);
        if (!apiResponse) {
          throw new Error("Gemini returned an empty response. Try another prompt.");
        }

        chatHistory = contents.concat({
          role: "model",
          parts: [{ text: apiResponse }],
        });

        showTypingEffect(apiResponse, textElement, incomingMessageDiv);
        return;
      }
    }

    throw lastError || new Error("No available Gemini model could answer this prompt.");
  } catch (error) {
    isResponseGenerating = false;
    textElement.innerText = friendlyError(error.message);
    textElement.classList.add("error");
    if (isRateLimited(0, error.message) || /api key|invalid/i.test(error.message)) {
      showApiSetup();
    }
  } finally {
    incomingMessageDiv.classList.remove("loading");
    persistChat();
  }
};

const showLoadingAnimation = () => {
  const html = `<div class="message-content">
      <img src="images/gemini.svg" alt="Gemini" class="avatar" />
      <p class="text"></p>
      <div class="loading-indicator">
        <div class="loading-bar"></div>
        <div class="loading-bar"></div>
        <div class="loading-bar"></div>
      </div>
    </div>
    <span onclick="copyMessage(this)" class="icon material-symbols-rounded">content_copy</span>`;

  const incomingMessageDiv = createMessageElement(html, "incoming", "loading");
  chatList.appendChild(incomingMessageDiv);
  chatList.scrollTo(0, chatList.scrollHeight);
  generateAPIResponse(incomingMessageDiv);
};

window.copyMessage = (copyIcon) => {
  const messageText = copyIcon.parentElement.querySelector(".text").innerText;
  navigator.clipboard.writeText(messageText);
  copyIcon.innerHTML = "done";
  setTimeout(() => (copyIcon.innerHTML = "content_copy"), 1000);
};

const handleOutgoingChat = () => {
  userMessage =
    typingForm.querySelector(".typing-input").value.trim() || userMessage;
  if (!userMessage || isResponseGenerating) return;
  if (!hasUserApiKey()) {
    showApiSetup();
    return;
  }

  isResponseGenerating = true;

  const html = `<div class="message-content">
      <img src="images/user.jpg" alt="You" class="avatar" />
      <p class="text"></p>
    </div>`;

  const outgoingMessageDiv = createMessageElement(html, "outgoing");
  outgoingMessageDiv.querySelector(".text").textContent = userMessage;
  chatList.appendChild(outgoingMessageDiv);
  typingForm.reset();
  chatList.scrollTo(0, chatList.scrollHeight);
  document.body.classList.add("hide-header");
  persistChat();

  setTimeout(showLoadingAnimation, 500);
};

suggestions.forEach((suggestion) => {
  suggestion.addEventListener("click", () => {
    userMessage = suggestion.querySelector(".text").innerText;
    handleOutgoingChat();
  });
});

apiKeyButton.addEventListener("click", showApiSetup);

apiKeySave.addEventListener("click", () => {
  const trimmed = apiKeyInput.value.trim();
  if (!trimmed) {
    apiKeyInput.focus();
    return;
  }
  localStorage.setItem("geminiApiKey", trimmed);
  hideApiSetup();
});

apiKeyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") apiKeySave.click();
});

if (!hasUserApiKey()) showApiSetup();

toggleThemeButton.addEventListener("click", () => {
  const isLightMode = document.body.classList.toggle("light_mode");
  localStorage.setItem("themeColor", isLightMode ? "light_mode" : "dark_mode");
  toggleThemeButton.innerText = isLightMode ? "dark_mode" : "light_mode";
});

deleteChatButton.addEventListener("click", () => {
  if (confirm("Are you sure you want to delete all messages?")) {
    localStorage.removeItem("savedChats");
    localStorage.removeItem("chatHistory");
    chatHistory = [];
    loadLocalStorageData();
  }
});

typingForm.addEventListener("submit", (e) => {
  e.preventDefault();
  handleOutgoingChat();
});
