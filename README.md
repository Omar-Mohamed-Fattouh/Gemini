# Gemini Chat Clone

A browser-based Gemini chat UI. Open `index.html` in a local server, type a prompt, and the app talks to the Gemini API.

## Run locally

Serve the folder (opening the file directly can block API requests in some browsers):

```bash
python -m http.server 5500
```

Then visit [http://localhost:5500](http://localhost:5500).

On first launch, paste a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). The bundled demo key is out of quota, so replies will not work until you add your own.
