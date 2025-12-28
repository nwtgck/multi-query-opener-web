# Multi Query Opener

> [!NOTE]
> Most of this project was created by Gemini 3 with significantly less human review than my usual projects.

* https://multi-query-opener.pages.dev/

A serverless tool to open multiple URLs with different query parameters at once.
The entire application state is compressed and stored in the URL fragment, making it easy to share your configurations.

## Features

- **Batch Open**: Open multiple URLs in new tabs simultaneously.
- **Individual Open**: Open specific parameter values individually.
- **State Persistence**: Configuration is saved in the URL fragment using CBOR encoding and Gzip compression.
- **Privacy**: Opens links with `noreferrer` for privacy.

## Getting Started

### Installation

```bash
npm ci
```

### Development

Start the development server:

```bash
npm run dev
```

### Build

Build for production:

```bash
npm run build
```
