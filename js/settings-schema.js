/*
 * E++ settings schema (generated file — do not edit by hand).
 *
 * Source of truth: settings/schema.json
 * Regenerate with: npm run build:settings
 *
 * The IDE fetches settings/schema.json when it is served over http(s) and
 * falls back to this copy when it is not, so the Settings dialog is always
 * rendered from data — never hardbaked into index.html or js/ide.js.
 */
(function (global) {
  'use strict';
  var EPP = global.EPP || (global.EPP = {});
  EPP.SettingsSchema = {
  "format": "eplusplus-settings-schema",
  "version": "6.1.1",
  "title": "Settings",
  "subtitle": "Dev Build 6.1 · everything here is stored in this browser",
  "doneLabel": "Done",
  "storageKey": "eplusplus.settings.v1",
  "description": "The E++ IDE settings schema. This file — not index.html and not js/ide.js — defines what appears in Settings. Add a setting here, run npm run build:settings, and the dialog renders it. The IDE fetches this file at runtime when it is served over http(s) and falls back to the generated js/settings-schema.js otherwise.",
  "groups": [
    {
      "id": "appearance",
      "title": "Appearance",
      "controls": [
        {
          "key": "theme",
          "type": "select",
          "label": "Theme",
          "default": "dark",
          "options": [
            {
              "value": "dark",
              "label": "Dark"
            },
            {
              "value": "light",
              "label": "Light"
            },
            {
              "value": "system",
              "label": "Match system"
            }
          ],
          "effect": {
            "kind": "theme"
          },
          "descriptionId": "settingsThemeNote",
          "notes": {
            "dark": "Your choice is saved in this browser only.",
            "light": "Your choice is saved in this browser only.",
            "system": "Following your operating system (currently {system})."
          }
        },
        {
          "key": "density",
          "type": "select",
          "label": "Layout density",
          "default": "comfortable",
          "options": [
            {
              "value": "comfortable",
              "label": "Comfortable"
            },
            {
              "value": "compact",
              "label": "Compact"
            }
          ],
          "effect": {
            "kind": "class-map",
            "classes": {
              "compact": "compact-ui"
            }
          },
          "description": "Compact trims padding so more code fits on screen."
        },
        {
          "key": "consoleHeight",
          "type": "select",
          "label": "Console height",
          "default": "normal",
          "options": [
            {
              "value": "compact",
              "label": "Compact"
            },
            {
              "value": "normal",
              "label": "Normal"
            },
            {
              "value": "tall",
              "label": "Tall"
            }
          ],
          "effect": {
            "kind": "class-map",
            "classes": {
              "compact": "console-compact",
              "tall": "console-tall"
            }
          }
        },
        {
          "key": "editorFontSize",
          "type": "select",
          "label": "Editor font size",
          "default": 14,
          "options": [
            {
              "value": 12,
              "label": "12 px"
            },
            {
              "value": 13,
              "label": "13 px"
            },
            {
              "value": 14,
              "label": "14 px"
            },
            {
              "value": 15,
              "label": "15 px"
            },
            {
              "value": 16,
              "label": "16 px"
            },
            {
              "value": 18,
              "label": "18 px"
            }
          ],
          "effect": {
            "kind": "css-var",
            "var": "--code-font-size",
            "unit": "px"
          }
        },
        {
          "key": "showDashboard",
          "type": "checkbox",
          "label": "Show the project dashboard bar",
          "default": true,
          "effect": {
            "kind": "class",
            "class": "hide-dashboard",
            "when": "falsy"
          }
        },
        {
          "key": "showLineNumbers",
          "type": "checkbox",
          "label": "Show line numbers in the editor",
          "default": true,
          "effect": {
            "kind": "class",
            "class": "hide-line-numbers",
            "when": "falsy"
          }
        },
        {
          "key": "showLibrariesPanel",
          "type": "checkbox",
          "label": "Show the Libraries panel",
          "default": true,
          "effect": {
            "kind": "class",
            "class": "hide-libraries-panel",
            "when": "falsy"
          }
        },
        {
          "key": "showHelpPanel",
          "type": "checkbox",
          "label": "Show the Quick reference panel",
          "default": true,
          "effect": {
            "kind": "class",
            "class": "hide-help-panel",
            "when": "falsy"
          }
        }
      ]
    },
    {
      "id": "editor",
      "title": "Editor",
      "controls": [
        {
          "key": "tabSize",
          "type": "select",
          "label": "Tab size",
          "default": 2,
          "options": [
            {
              "value": 2,
              "label": "2 spaces"
            },
            {
              "value": 4,
              "label": "4 spaces"
            },
            {
              "value": 8,
              "label": "8 spaces"
            }
          ],
          "effect": {
            "kind": "css-var",
            "var": "--tab-size"
          }
        },
        {
          "key": "tabChar",
          "type": "checkbox",
          "label": "Tab key inserts a real tab character",
          "default": false
        },
        {
          "key": "wordWrap",
          "type": "checkbox",
          "label": "Wrap long lines instead of scrolling sideways",
          "default": false,
          "effect": {
            "kind": "class",
            "class": "wrap-code",
            "when": "truthy"
          }
        },
        {
          "key": "autoSave",
          "type": "checkbox",
          "label": "Auto-save as you type",
          "default": true
        },
        {
          "key": "autoSaveDelay",
          "type": "select",
          "label": "Auto-save delay",
          "default": 450,
          "options": [
            {
              "value": 300,
              "label": "300 ms"
            },
            {
              "value": 450,
              "label": "450 ms"
            },
            {
              "value": 900,
              "label": "900 ms"
            },
            {
              "value": 1500,
              "label": "1500 ms"
            }
          ],
          "description": "Only used while auto-save is on. Ctrl+S always saves."
        }
      ]
    },
    {
      "id": "behaviour",
      "title": "Behaviour",
      "controls": [
        {
          "key": "autoEppla",
          "type": "checkbox",
          "label": "Auto-change to .eppla when a library is detected",
          "default": true,
          "description": "E++ keeps .eppl strictly library-free; this renames the file the moment add library appears."
        },
        {
          "key": "clearConsoleOnRun",
          "type": "checkbox",
          "label": "Clear the console before every run",
          "default": true
        },
        {
          "key": "confirmDelete",
          "type": "checkbox",
          "label": "Ask before deleting a file",
          "default": true
        },
        {
          "key": "restoreLastFile",
          "type": "checkbox",
          "label": "Re-open the last file when the IDE starts",
          "default": true
        }
      ]
    },
    {
      "id": "tutorial",
      "title": "Tutorial",
      "controls": [
        {
          "type": "info",
          "id": "settingsTutorialInfo",
          "text": "Loading the lesson pack…"
        },
        {
          "key": "autoOpenTutorial",
          "type": "checkbox",
          "label": "Open the tutorial automatically on your first visit",
          "default": true
        },
        {
          "type": "actions",
          "buttons": [
            {
              "id": "settingsResetTutorial",
              "label": "Reset tutorial progress & my lessons",
              "action": "resetTutorial"
            }
          ]
        }
      ]
    },
    {
      "id": "data",
      "title": "Data",
      "controls": [
        {
          "type": "info",
          "text": "Files, settings and lessons are kept in this browser's localStorage — nothing leaves your machine."
        },
        {
          "type": "actions",
          "buttons": [
            {
              "id": "settingsRestoreExamples",
              "label": "Restore example files",
              "action": "restoreExamples"
            },
            {
              "id": "settingsReset",
              "label": "Reset all settings",
              "action": "resetSettings"
            },
            {
              "id": "settingsWipe",
              "label": "Delete all local data…",
              "action": "wipeData",
              "className": "btn-danger-outline"
            }
          ]
        }
      ]
    }
  ]
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
