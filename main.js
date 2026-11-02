const typingForm = document.querySelector(".typing-form");
const chatList = document.querySelector(".chat-list");
const suggestions = document.querySelectorAll(".suggestion-list .suggestion");
const toggleThemeButton = document.querySelector("#toggle-theme-button");
const deleteChatButton = document.querySelector("#delete-chat-button");
const apiKeyButton = document.querySelector("#api-key-button");

let userMessage = null;
let isResponseGenerating = false;
let chatHistory = [];

const DEFAULT_API_KEY = "AIzaSyAmo0hP-ZsWNwgcndk2o1MYRk0598Q0j-I";
const MODELS = ["gemini-flash-latest", "gemini-3.8-flash"];

const getApiKey = () => localStorage.getItem("geminiApiKey") || DEFAULT_API_KEY;

const apiUrlFor = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${getApiKey()}`;

const friendlyError = (message) => {
  if (/quota exceeded|resource exhausted|rate/i.test(message)) {
    return "This API key hit its rate limit. Wait a minute, or click the key icon and paste a key from Google AI Studio.";
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
  document.body.classList.toggle("hide-header", Boolean(savedChats));
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

const generateAPIResponse = async (incomingMessageDiv) => {
  const textElement = incomingMessageDiv.querySelector(".text");
  let lastError = null;

  try {
    chatHistory.push({
      role: "user",
      parts: [{ text: userMessage }],
    });

    for (const model of MODELS) {
      try {
        const response = await fetch(apiUrlFor(model), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: chatHistory }),
        });

        const data = await response.json();
        if (!response.ok) {
          const message = data?.error?.message || `Request failed (${response.status})`;
          const notFound = response.status === 404 || /not found|not supported/i.test(message);
          if (notFound) {
            lastError = new Error(message);
            continue;
          }
          throw new Error(message);
        }

        const apiResponse = extractText(data);
        if (!apiResponse) {
          throw new Error("Gemini returned an empty response. Try another prompt.");
        }

        chatHistory.push({
          role: "model",
          parts: [{ text: apiResponse }],
        });

        showTypingEffect(apiResponse, textElement, incomingMessageDiv);
        return;
      } catch (error) {
        lastError = error;
        if (!/not found|not supported/i.test(error.message)) throw error;
      }
    }

    throw lastError || new Error("No available Gemini model could answer this prompt.");
  } catch (error) {
    isResponseGenerating = false;
    chatHistory = chatHistory.filter(
      (item, index) => !(index === chatHistory.length - 1 && item.role === "user")
    );
    textElement.innerText = friendlyError(error.message);
    textElement.classList.add("error");
    persistChat();
  } finally {
    incomingMessageDiv.classList.remove("loading");
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

apiKeyButton.addEventListener("click", () => {
  const nextKey = prompt(
    "Paste your Gemini API key from Google AI Studio:",
    localStorage.getItem("geminiApiKey") || ""
  );
  if (nextKey === null) return;
  const trimmed = nextKey.trim();
  if (trimmed) localStorage.setItem("geminiApiKey", trimmed);
  else localStorage.removeItem("geminiApiKey");
  alert(trimmed ? "API key saved in this browser." : "API key cleared. The default key will be used.");
});

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
