/**
 * platform-capabilities.js — Platform Capability Mapping
 *
 * Describes each platform's DOM characteristics to guide the Detection Strategy Pipeline.
 */

window.ThreadMapPlatformCapabilities = {
    chatgpt: {
        roleAttributes: true,
        stableIds: true,
        structuredTurns: true,
        semanticPattern: false
    },
    claude: {
        roleAttributes: true,
        stableIds: false, // IDs often change or are absent on message containers
        structuredTurns: true,
        semanticPattern: false
    },
    gemini: {
        roleAttributes: false, // Less reliable, uses custom components
        stableIds: false,
        structuredTurns: false,
        semanticPattern: false
    }
};
