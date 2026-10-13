/**
 * @file tasks.js
 * @overview tasks implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createTasks(runtimeContext) {
  // Helper for retrieving Tasks plugin configuration and formats
  const getTasksUiOptions = () => {
    const tasksPlugin = app.plugins.getPlugin("obsidian-tasks-plugin");
    const mode = tasksPlugin?.configuration?.taskFormat || "emoji";
    let dateFields = [];
    if (mode === "dataview") {
      dateFields = [
        "📅 [due:: ]",
        "🛫 [start:: ]",
        "⏳ [scheduled:: ]",
        "➕ [created:: ]",
        "✅ [done:: ]",
        "❌ [cancelled:: ]",
      ];
    } else {
      dateFields = ["📅 Due", "🛫 Start", "⏳ Scheduled", "➕ Created", "✅ Done", "❌ Cancelled"];
    }
    const priorities = ["🔺 Highest", "⏫ High", "🔼 Medium", " Normal", "🔽 Low", "⏬ Lowest"];
    return {
      mode,
      dateFields,
      priorities,
    };
  };

  // Parses an existing task string into dates, priority, and recurrence
  const parseTasksData = (text, mode) => {
    const priorityMap = {
      "🔺": "highest",
      "⏫": "high",
      "🔼": "medium",
      "🔽": "low",
      "⏬": "lowest",
    };
    let priority = "normal";
    for (const [emoji, val] of Object.entries(priorityMap)) {
      if (text.includes(emoji)) {
        priority = val;
        break;
      }
    }
    let recurrence = "";
    let dates = [];
    if (mode === "dataview") {
      const recMatch = text.match(/\[recurrence:: ([^\]]+)\]/i);
      if (recMatch) recurrence = recMatch[1];
      const dateFields = ["due", "start", "scheduled", "created", "done", "cancelled"];
      for (const field of dateFields) {
        const regex = new RegExp(`\\[${field}:: (\\d{4}-\\d{2}-\\d{2})\\]`, "gi");
        let match;
        while ((match = regex.exec(text)) !== null) {
          dates.push({
            type: field,
            date: match[1],
          });
        }
      }
    } else {
      const recMatch = text.match(/🔁\s*([a-zA-Z0-9 ,]+)/i);
      if (recMatch) recurrence = recMatch[1].trim();
      const emojiFields = {
        "📅": "due",
        "🛫": "start",
        "⏳": "scheduled",
        "➕": "created",
        "✅": "done",
        "❌": "cancelled",
      };
      for (const [emoji, field] of Object.entries(emojiFields)) {
        const regex = new RegExp(`${emoji}\\s*(\\d{4}-\\d{2}-\\d{2})`, "g");
        let match;
        while ((match = regex.exec(text)) !== null) {
          dates.push({
            type: field,
            date: match[1],
          });
        }
      }
    }
    return {
      priority,
      recurrence,
      dates,
    };
  };

  // Helper to remove any existing Tasks/Dataview fields and priority/date emojis
  const cleanTasksString = (text) => {
    let cleaned = text;
    // Strip Dataview-styled bracket dates/fields
    cleaned = cleaned.replace(
      /\[(due|start|scheduled|created|done|cancelled|recurrence)::\s*[^\]]+\]/gi,
      "",
    );
    // Strip Emoji-styled dates
    cleaned = cleaned.replace(/[📅🛫⏳➕✅❌]\s*\d{4}-\d{2}-\d{2}/g, "");
    // Strip Recurrence emoji and standard text rules (stops at next emoji or bracket)
    cleaned = cleaned.replace(/🔁\s*[a-zA-Z0-9 ,]+/g, "");
    // Strip Priorities
    cleaned = cleaned.replace(/[🔺⏫🔼🔽⏬]/g, "");
    // Normalize spacing
    cleaned = cleaned.replace(/  +/g, " ").trim();
    return cleaned;
  };

  // Open standard Obsidian modal configuration interface for calendar mapping
  const openCalendarModal = async () => {
    let targetText = "";
    let isInputEl = false;
    let textElId = null;
    let sel = null;
    // Mode 1: Edit from Input Box
    if (runtimeContext.inputEl && runtimeContext.inputEl.value.trim() !== "") {
      targetText = runtimeContext.inputEl.value;
      isInputEl = true;
    } else {
      // Mode 2: Edit from selected Node
      sel = runtimeContext.getMindmapNodeFromSelection();
      if (!sel) return;
      const all = runtimeContext.ea.getViewElements();
      const info = runtimeContext.getHierarchy(sel, all);
      if (info.rootId === sel.id) return; // General rule: no effect on root node
      textElId = sel.type === "text" ? sel.id : null;
      if (!textElId && sel.boundElements) {
        const boundText = sel.boundElements.find((be) => be.type === "text");
        if (boundText) textElId = boundText.id;
      }
      if (!textElId) return;
      const textEl = all.find((el) => el.id === textElId);
      if (!textEl) return;
      targetText = textEl.rawText;
    }
    const uiOpts = getTasksUiOptions();
    const parsed = parseTasksData(targetText, uiOpts.mode);
    let dates =
      parsed.dates.length > 0
        ? parsed.dates
        : [
            {
              type: "due",
              date: window.moment().format("YYYY-MM-DD"),
            },
          ];
    let activeDateIndex = 0;
    let priority = parsed.priority;
    let recurrence = parsed.recurrence;
    const modal = new runtimeContext.ea.obsidian.Modal(app);
    modal.titleEl.setText(runtimeContext.t("ACTION_LABEL_CALENDAR"));
    let dateInputComp, typeDropdownComp;
    const renderContent = () => {
      const { contentEl } = modal;
      contentEl.empty();
      // Navigation Row for multi-date handling
      const navRow = contentEl.createDiv({
        attr: {
          style:
            "display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;",
        },
      });
      const leftNav = navRow.createDiv({
        attr: {
          style: "display: flex; align-items: center; gap: 10px;",
        },
      });
      const prevBtn = leftNav.createEl("button");
      prevBtn.innerHTML = runtimeContext.ea.obsidian.getIcon("chevron-left").outerHTML;
      prevBtn.disabled = activeDateIndex === 0;
      prevBtn.onclick = () => {
        activeDateIndex--;
        renderContent();
      };
      leftNav.createSpan({
        text: runtimeContext.t("CALENDAR_DATE_INDEX", {
          index: activeDateIndex + 1,
          total: dates.length,
        }),
      });
      const nextBtn = leftNav.createEl("button");
      nextBtn.innerHTML = runtimeContext.ea.obsidian.getIcon("chevron-right").outerHTML;
      nextBtn.onclick = () => {
        if (activeDateIndex === dates.length - 1) {
          dates.push({
            type: "due",
            date: window.moment().format("YYYY-MM-DD"),
          });
        }
        activeDateIndex++;
        renderContent();
      };
      const delBtn = navRow.createEl("button");
      delBtn.innerHTML = runtimeContext.ea.obsidian.getIcon("trash-2").outerHTML;
      delBtn.disabled = dates.length === 1 && !dates[0].date; // Can't delete if it's just the empty default
      delBtn.onclick = () => {
        dates.splice(activeDateIndex, 1);
        if (dates.length === 0) {
          dates.push({
            type: "due",
            date: window.moment().format("YYYY-MM-DD"),
          });
        }
        if (activeDateIndex >= dates.length) activeDateIndex = dates.length - 1;
        renderContent();
      };
      // Active Date Object
      const activeDateObj = dates[activeDateIndex];
      // 1) Date picker input (Focus First)
      new runtimeContext.ea.obsidian.Setting(contentEl)
        .setName(runtimeContext.t("CALENDAR_DATE_LABEL"))
        .addText((text) => {
          dateInputComp = text;
          text.inputEl.type = "date";
          text.setValue(activeDateObj.date);
          text.onChange((val) => {
            activeDateObj.date = val;
          });
          text.inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (typeDropdownComp && typeDropdownComp.selectEl) {
                typeDropdownComp.selectEl.focus();
              }
            }
          });
          text.inputEl.addEventListener("change", (e) => {
            if (
              document.activeElement === text.inputEl &&
              typeDropdownComp &&
              typeDropdownComp.selectEl
            ) {
              typeDropdownComp.selectEl.focus();
            }
          });
        });
      // 2) Field type configuration selector matching active schema ontology
      new runtimeContext.ea.obsidian.Setting(contentEl)
        .setName(runtimeContext.t("CALENDAR_DATE_TYPE"))
        .addDropdown((dropdown) => {
          typeDropdownComp = dropdown;
          if (uiOpts.mode === "dataview") {
            dropdown.addOption("due", "📅 [due:: ]");
            dropdown.addOption("start", "🛫 [start:: ]");
            dropdown.addOption("scheduled", "⏳ [scheduled:: ]");
            dropdown.addOption("created", "➕ [created:: ]");
            dropdown.addOption("done", "✅ [done:: ]");
            dropdown.addOption("cancelled", "❌ [cancelled:: ]");
          } else {
            dropdown.addOption("due", `📅 ${runtimeContext.t("CALENDAR_DATETYPE_DUE")}`);
            dropdown.addOption("start", `🛫 ${runtimeContext.t("CALENDAR_DATETYPE_START")}`);
            dropdown.addOption(
              "scheduled",
              `⏳ ${runtimeContext.t("CALENDAR_DATETYPE_SCHEDULED")}`,
            );
            dropdown.addOption("created", `➕ ${runtimeContext.t("CALENDAR_DATETYPE_CREATED")}`);
            dropdown.addOption("done", `✅ ${runtimeContext.t("CALENDAR_DATETYPE_DONE")}`);
            dropdown.addOption(
              "cancelled",
              `❌ ${runtimeContext.t("CALENDAR_DATETYPE_CANCELLED")}`,
            );
          }
          dropdown.setValue(activeDateObj.type);
          dropdown.onChange((val) => {
            activeDateObj.type = val;
          });
        });
      // 3) Priority selector mapped to native Tasks emojis
      new runtimeContext.ea.obsidian.Setting(contentEl)
        .setName(runtimeContext.t("CALENDAR_PRIORITY"))
        .addDropdown((dropdown) => {
          dropdown.addOption("highest", `🔺 ${runtimeContext.t("CALENDAR_PRIORITY_HIGHEST")}`);
          dropdown.addOption("high", `⏫ ${runtimeContext.t("CALENDAR_PRIORITY_HIGH")}`);
          dropdown.addOption("medium", `🔼 ${runtimeContext.t("CALENDAR_PRIORITY_MEDIUM")}`);
          dropdown.addOption("normal", `  ${runtimeContext.t("CALENDAR_PRIORITY_NORMAL")}`);
          dropdown.addOption("low", `🔽 ${runtimeContext.t("CALENDAR_PRIORITY_LOW")}`);
          dropdown.addOption("lowest", `⏬ ${runtimeContext.t("CALENDAR_PRIORITY_LOWEST")}`);
          dropdown.setValue(priority);
          dropdown.onChange((val) => {
            priority = val;
          });
        });
      // 4) Recurrence free text input
      const recSetting = new runtimeContext.ea.obsidian.Setting(contentEl)
        .setName(runtimeContext.t("CALENDAR_RECURRENCE"))
        .addText((text) => {
          text
            .setPlaceholder(runtimeContext.t("CALENDAR_RECURRENCE_PLACEHOLDER"))
            .setValue(recurrence)
            .onChange((val) => {
              recurrence = val;
            });
        });
      recSetting.descEl.innerHTML = runtimeContext.t("CALENDAR_RECURRENCE_DESC");
      // 5) Inject Node Link toggle
      const linkSettingsRow = new runtimeContext.ea.obsidian.Setting(contentEl)
        .setName(runtimeContext.t("CALENDAR_INJECT_LINK"))
        .setDesc(runtimeContext.t("CALENDAR_INJECT_LINK_DESC"));
      let aliasTextComp;
      linkSettingsRow.addToggle((toggle) => {
        toggle.setValue(runtimeContext.injectNodeLink).onChange((val) => {
          runtimeContext.injectNodeLink = val;
          runtimeContext.setVal(runtimeContext.K_INJECT_LINK, val);
          aliasTextComp.inputEl.style.display = val ? "" : "none";
        });
      });
      linkSettingsRow.addText((text) => {
        aliasTextComp = text;
        text
          .setPlaceholder(runtimeContext.t("CALENDAR_ALIAS_PLACEHOLDER"))
          .setValue(runtimeContext.nodeLinkAlias)
          .onChange((val) => {
            runtimeContext.nodeLinkAlias = val || "link";
            runtimeContext.setVal(runtimeContext.K_LINK_ALIAS, runtimeContext.nodeLinkAlias);
          });
        text.inputEl.style.display = runtimeContext.injectNodeLink ? "" : "none";
        text.inputEl.style.width = "100px";
        text.inputEl.style.marginLeft = "10px";
      });
      // Controls button block
      const btnContainer = contentEl.createDiv({
        attr: {
          style: "display: flex; gap: 10px; justify-content: flex-end; margin-top: 15px;",
        },
      });
      const cancelBtn = btnContainer.createEl("button", {
        text: runtimeContext.t("CALENDAR_BTN_CANCEL"),
      });
      cancelBtn.onclick = () => modal.close();
      const taskOnlyBtn = btnContainer.createEl("button", {
        text: runtimeContext.t("CALENDAR_BTN_TASK_ONLY"),
      });
      taskOnlyBtn.onclick = () => handleSave(false);
      const saveBtn = btnContainer.createEl("button", {
        text: runtimeContext.t("CALENDAR_BTN_ADD_DATE_TASK"),
        cls: "mod-cta",
      });
      saveBtn.onclick = () => handleSave(true);
      // Date picker auto-open / focus
      setTimeout(() => {
        if (dateInputComp && dateInputComp.inputEl) {
          dateInputComp.inputEl.focus();
          if (typeof dateInputComp.inputEl.showPicker === "function") {
            try {
              dateInputComp.inputEl.showPicker();
            } catch (e) {}
          }
        }
      }, 50);
    };
    const handleSave = async (includeDate = true) => {
      modal.close();
      let tasksString = "";
      if (includeDate) {
        const validDates = dates.filter((d) => d.date);
        if (uiOpts.mode === "dataview") {
          let priorityStr = "";
          const priorityMap = {
            highest: "🔺",
            high: "⏫",
            medium: "🔼",
            normal: "",
            low: "🔽",
            lowest: "⏬",
          };
          if (priority !== "normal") priorityStr = priorityMap[priority];
          let dateStrs = validDates.map((d) => `[${d.type}:: ${d.date}]`);
          let recStr = recurrence ? `[recurrence:: ${recurrence}]` : "";
          const parts = [priorityStr, ...dateStrs, recStr].filter(Boolean);
          if (parts.length > 0) tasksString = " " + parts.join("  ");
        } else {
          let priorityStr = "";
          const priorityMap = {
            highest: " 🔺",
            high: " ⏫",
            medium: " 🔼",
            normal: "",
            low: " 🔽",
            lowest: " ⏬",
          };
          priorityStr = priorityMap[priority] || "";
          const emojiMap = {
            due: "📅",
            start: "🛫",
            scheduled: "⏳",
            created: "➕",
            done: "✅",
            cancelled: "❌",
          };
          let dateStrs = validDates.map((d) => ` ${emojiMap[d.type]} ${d.date}`);
          let recStr = recurrence ? ` 🔁 ${recurrence}` : "";
          tasksString = `${priorityStr}${dateStrs.join("")}${recStr}`;
        }
      }
      const taskRegex = /^- \[([ xX])\] (.*)/s;
      const match = targetText.match(taskRegex);
      let cleanText = cleanTasksString(match ? match[2] : targetText);
      // Ensure we don't duplicate an existing auto-generated link at the end
      const linkRegex = /\s*\(\[\[[^\]]+#\^group=[a-zA-Z0-9_-]+\|[^\]]+\]\]\)$/;
      if (linkRegex.test(cleanText)) {
        cleanText = cleanText.replace(linkRegex, "");
      }
      let finalPrefix = match ? `- [${match[1]}] ` : "- [ ] ";
      let newText = `${finalPrefix}${cleanText}`;
      if (runtimeContext.injectNodeLink) {
        if (isInputEl) {
          newText += ` __NODE_LINK_PLACEHOLDER__`;
        } else {
          const file = app.workspace.getActiveFile();
          const fileName = file ? file.basename : "";
          newText += ` ([[${fileName}#^group=${textElId}|${runtimeContext.nodeLinkAlias}]])`;
        }
      }
      newText += tasksString;
      if (isInputEl) {
        runtimeContext.inputEl.value = newText;
        runtimeContext.updateUI();
      } else {
        const all = runtimeContext.ea.getViewElements();
        const textEl = all.find((el) => el.id === textElId);
        runtimeContext.ea.copyViewElementsToEAforEditing([textEl]);
        const eaEl = runtimeContext.ea.getElement(textEl.id);
        eaEl.rawText = newText;
        eaEl.text = newText;
        eaEl.originalText = newText;
        runtimeContext.ea.refreshTextElementSize(eaEl.id);
        await runtimeContext.addElementsToView({
          captureUpdate: runtimeContext.autoLayoutDisabled ? "IMMEDIATELY" : "EVENTUALLY",
        });
        if (eaEl.containerId) {
          const updatedContainer = runtimeContext.ea
            .getViewElements()
            .find((el) => el.id === eaEl.containerId);
          if (updatedContainer) runtimeContext.api().updateContainerSize([updatedContainer]);
        }
        if (!runtimeContext.autoLayoutDisabled) {
          const info = runtimeContext.getHierarchy(sel, runtimeContext.ea.getViewElements());
          await runtimeContext.triggerGlobalLayout(info.rootId);
        }
        runtimeContext.updateUI();
      }
    };
    modal.onOpen = () => {
      renderContent();
      // Add Ctrl+Enter / Meta+Enter listener
      modal.modalEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          e.stopPropagation();
          handleSave(true);
        }
        // Prevent Escape from propagating to the underlying floating modal or canvas
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          modal.close();
        }
      });
    };
    modal.open();
  };
  return { getTasksUiOptions, parseTasksData, cleanTasksString, openCalendarModal };
}
