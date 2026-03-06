/**
 * message-model.js — Canonical Message Model for ThreadMap
 *
 * Defines a normalized message object that the entire extension uses.
 * The UI and TOC engine interact with this model instead of raw DOM nodes.
 */

class MessageModel {
    /**
     * @param {Object} props
     * @param {string} props.id - Unique identifier for the message
     * @param {string} props.text - The visible text content
     * @param {HTMLElement} props.element - The associated DOM element (usually the scroll target)
     * @param {"user" | "assistant"} props.role - The author role
     * @param {string} props.platform - The platform identifier (e.g., 'chatgpt')
     */
    constructor({ id, text, element, role, platform }) {
        this.id = id;
        this.text = text;
        this.element = element;
        this.role = role;
        this.platform = platform;
    }

    /**
     * Validate the model instance.
     * @throws {Error} If validation fails.
     */
    validate() {
        if (!this.id) throw new Error("MessageModel requires 'id'");
        if (typeof this.text !== 'string') throw new Error("MessageModel requires 'text' to be a string");
        if (!(this.element instanceof HTMLElement)) throw new Error("MessageModel requires 'element' to be an HTMLElement");
        if (this.role !== 'user' && this.role !== 'assistant') throw new Error("MessageModel requires 'role' to be 'user' or 'assistant'");
        if (!this.platform) throw new Error("MessageModel requires 'platform'");
    }
}

window.ThreadMapMessageModel = MessageModel;
