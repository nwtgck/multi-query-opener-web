import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import * as CBOR from "cbor-x";
import App from "./App.vue";

/**
 * Sync Mock for CompressionStream/DecompressionStream to stabilize tests.
 */
class MockTransformStream {
  readable: ReadableStream;
  writable: WritableStream;

  constructor() {
    let controller: ReadableStreamDefaultController;
    this.readable = new ReadableStream({
      start(c) {
        controller = c;
      },
    });
    this.writable = new WritableStream({
      write(chunk) {
        controller.enqueue(chunk);
      },
      close() {
        controller.close();
      },
    });
  }
}

// Mock window.open
const mockOpen = vi.fn();
Object.defineProperty(window, "open", {
  value: mockOpen,
  writable: true,
});

// Mock window.location
const mockLocation = {
  hash: "",
  href: "http://localhost/",
};
Object.defineProperty(window, "location", {
  value: mockLocation,
  writable: true,
});

// Mock history.replaceState
const mockReplaceState = vi.fn((_state: unknown, _title: string, url: string) => {
  mockLocation.hash = url.startsWith("#") ? url : new URL(url, "http://localhost").hash;
  mockLocation.href = `http://localhost/${url}`;
});
Object.defineProperty(window.history, "replaceState", {
  value: mockReplaceState,
  writable: true,
});

globalThis.CompressionStream = MockTransformStream as unknown as typeof CompressionStream;
globalThis.DecompressionStream = MockTransformStream as unknown as typeof DecompressionStream;

describe("App.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.hash = "";
    mockLocation.href = "http://localhost/";
    document.title = "";
  });

  describe("Initial rendering", () => {
    it("renders correctly", () => {
      const wrapper = mount(App);
      expect(wrapper.find("h1").text()).toContain("Multi Query Opener");
    });
  });

  describe("State updates", () => {
    it("updates state and document title when inputs change", async () => {
      vi.useFakeTimers();
      const wrapper = mount(App);
      const titleInput = wrapper.find("[data-testid=\"page-title-input\"]");
      await titleInput.setValue("My Custom Title");
      
      // Wait for debounce (500ms)
      vi.advanceTimersByTime(500);
      await flushPromises();
      
      expect(document.title).toBe("My Custom Title");
      vi.useRealTimers();
    });
  });

  describe("URL opening", () => {
    it("opens all URLs from root and groups", async () => {
      const wrapper = mount(App);
      
      // Fill base config using data-testid
      await wrapper.find("[data-testid=\"base-url-input\"]").setValue("https://example.com");
      await wrapper.find("[data-testid=\"param-key-input\"]").setValue("q");

      // Set root value
      const rootTextarea = wrapper.find("textarea");
      await rootTextarea.setValue("root-val");

      // Add group and values
      const buttons = wrapper.findAll("button");
      const addGroupBtn = buttons.find(b => b.text() === "Add Group");
      await addGroupBtn?.trigger("click");
      await flushPromises();

      const addValBtn = wrapper.findAll("button").find(b => b.text() === "+ Add Value to Group");
      await addValBtn?.trigger("click");
      await flushPromises();

      const textareas = wrapper.findAll("textarea");
      await textareas[1]!.setValue("group-val-1");
      await textareas[2]!.setValue("group-val-2");

      mockOpen.mockReturnValue({} as Window);
      const openAllBtn = wrapper.findAll("button").find(b => b.text() === "Open All in New Tabs");
      await openAllBtn?.trigger("click");

      expect(mockOpen).toHaveBeenCalledWith(expect.stringContaining("q=root-val"), "_blank", "noreferrer");
      expect(mockOpen).toHaveBeenCalledWith(expect.stringContaining("q=group-val-1"), "_blank", "noreferrer");
      expect(mockOpen).toHaveBeenCalledWith(expect.stringContaining("q=group-val-2"), "_blank", "noreferrer");
    });
  });

  describe("Error reporting", () => {
    it("shows error when configuration is missing", async () => {
      const wrapper = mount(App);
      
      // Clear config
      await wrapper.find("[data-testid=\"base-url-input\"]").setValue("");
      await wrapper.find("[data-testid=\"param-key-input\"]").setValue("");
      
      const openAllBtn = wrapper.findAll("button").find(b => b.text() === "Open All in New Tabs");
      await openAllBtn?.trigger("click");
      expect(wrapper.text()).toContain("Please enter both Base URL and Query Parameter Name");
    });

    it("shows error when popups are blocked", async () => {
      const wrapper = mount(App);
      await wrapper.find("[data-testid=\"base-url-input\"]").setValue("https://example.com");
      await wrapper.find("[data-testid=\"param-key-input\"]").setValue("q");
      await wrapper.find("textarea").setValue("test");

      // Simulate popup blocked
      mockOpen.mockReturnValue(null);

      const openAllBtn = wrapper.findAll("button").find(b => b.text() === "Open All in New Tabs");
      await openAllBtn?.trigger("click");

      expect(wrapper.text()).toContain("tabs were blocked by your browser");
    });

    it("shows singular error when an individual popup is blocked", async () => {
      const wrapper = mount(App);
      await wrapper.find("[data-testid=\"base-url-input\"]").setValue("https://example.com");
      await wrapper.find("[data-testid=\"param-key-input\"]").setValue("q");
      await wrapper.find("textarea").setValue("test");

      // Simulate popup blocked
      mockOpen.mockReturnValue(null);

      // Find the individual open button
      const openSingleBtn = wrapper.find("button[title=\"Open in new tab\"]");
      await openSingleBtn.trigger("click");

      expect(wrapper.text()).toContain("The tab was blocked by your browser");
    });

    it("shows configuration error when individual button is clicked without config", async () => {
      const wrapper = mount(App);
      await wrapper.find("[data-testid=\"base-url-input\"]").setValue("");
      
      const openSingleBtn = wrapper.find("button[title=\"Open in new tab\"]");
      await openSingleBtn.trigger("click");

      expect(wrapper.text()).toContain("Please enter both Base URL and Query Parameter Name");
    });
  });

  describe("Persistence", () => {
    it("restores state from URL hash", async () => {
      const initialState = {
        title: "Persistence Test",
        baseUrl: "https://test.io",
        paramKey: "key",
        paramValues: [
          { id: 1, value: "val1" },
          { 
            id: 2, 
            name: "Group 1", 
            values: [{ id: 3, value: "val2" }], 
          },
        ],
      };
      
      const cborData = CBOR.encode(initialState);
      const binary = Array.from(cborData).map((b) => String.fromCharCode(b)).join("");
      const hash = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      
      mockLocation.hash = `#${hash}`;

      const wrapper = mount(App);
      await flushPromises();
      await new Promise(resolve => setTimeout(resolve, 50));

      expect((wrapper.find("[data-testid=\"base-url-input\"]").element as HTMLInputElement).value).toBe("https://test.io");
      const textareas = wrapper.findAll("textarea");
      expect(textareas.length).toBe(2);
      expect((textareas[0]!.element as HTMLTextAreaElement).value).toBe("val1");
      expect((textareas[1]!.element as HTMLTextAreaElement).value).toBe("val2");
    });
  });
});
