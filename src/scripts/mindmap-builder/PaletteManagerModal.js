/**
 * @file PaletteManagerModal.js
 * @overview Palette Manager Modal implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createPaletteManagerModal(runtimeContext) {
  // ---------------------------------------------------------------------------
  // 8. Custom Colors: Palette Manager Modal
  // ---------------------------------------------------------------------------
  class PaletteManagerModal extends runtimeContext.ea.FloatingModal {
    constructor(app, settings, onUpdate) {
      super(app);
      this.settings = JSON.parse(JSON.stringify(settings));
      this.onUpdate = onUpdate;
      this.editIndex = -1; // -1 means adding new, >=0 means editing existing
      this.tempColor = "#000000";
    }
    onOpen() {
      this.display();
    }
    display() {
      const { contentEl } = this;
      contentEl.empty();
      contentEl.createEl("h2", {
        text: runtimeContext.t("MODAL_PALETTE_TITLE"),
      });
      /* --- Global Toggles --- */
      new runtimeContext.ea.obsidian.Setting(contentEl)
        .setName(runtimeContext.t("LABEL_ENABLE_CUSTOM_PALETTE"))
        .setDesc(runtimeContext.t("DESC_ENABLE_CUSTOM_PALETTE"))
        .addToggle((t) =>
          t.setValue(this.settings.enabled).onChange((v) => {
            this.settings.enabled = v;
            this.save();
            this.display();
          }),
        );
      if (this.settings.enabled) {
        new runtimeContext.ea.obsidian.Setting(contentEl)
          .setName(runtimeContext.t("LABEL_RANDOMIZE_ORDER"))
          .setDesc(runtimeContext.t("DESC_RANDOMIZE_ORDER"))
          .addToggle((t) =>
            t.setValue(this.settings.random).onChange((v) => {
              this.settings.random = v;
              this.save();
            }),
          );
        contentEl.createEl("hr");
        /* --- Color List --- */
        const listContainer = contentEl.createDiv();
        this.settings.colors.forEach((color, index) => {
          const row = new runtimeContext.ea.obsidian.Setting(listContainer);
          // Color Preview & Name
          const nameEl = row.nameEl;
          nameEl.style.display = "flex";
          nameEl.style.alignItems = "center";
          nameEl.style.gap = "10px";
          const preview = nameEl.createDiv();
          preview.style.width = "20px";
          preview.style.height = "20px";
          preview.style.backgroundColor = color;
          preview.style.border = "1px solid var(--background-modifier-border)";
          preview.style.borderRadius = "4px";
          nameEl.createSpan({
            text: color,
          });
          // Actions
          row
            .addExtraButton((btn) =>
              btn
                .setIcon("arrow-big-up")
                .setTooltip(runtimeContext.t("TOOLTIP_MOVE_UP"))
                .setDisabled(index === 0)
                .onClick(() => {
                  if (index === 0) return;
                  [this.settings.colors[index - 1], this.settings.colors[index]] = [
                    this.settings.colors[index],
                    this.settings.colors[index - 1],
                  ];
                  this.save();
                  this.display();
                }),
            )
            .addExtraButton((btn) =>
              btn
                .setIcon("arrow-big-down")
                .setTooltip(runtimeContext.t("TOOLTIP_MOVE_DOWN"))
                .setDisabled(index === this.settings.colors.length - 1)
                .onClick(() => {
                  if (index === this.settings.colors.length - 1) return;
                  [this.settings.colors[index + 1], this.settings.colors[index]] = [
                    this.settings.colors[index],
                    this.settings.colors[index + 1],
                  ];
                  this.save();
                  this.display();
                }),
            )
            .addExtraButton((btn) =>
              btn
                .setIcon("pencil")
                .setTooltip(runtimeContext.t("TOOLTIP_EDIT_COLOR"))
                .onClick(() => {
                  this.editIndex = index;
                  this.tempColor = color;
                  this.display();
                }),
            )
            .addExtraButton((btn) =>
              btn
                .setIcon("trash-2")
                .setTooltip(runtimeContext.t("TOOLTIP_DELETE_COLOR"))
                .onClick(() => {
                  this.settings.colors.splice(index, 1);
                  if (this.editIndex === index) this.editIndex = -1;
                  this.save();
                  this.display();
                }),
            );
        });
        contentEl.createEl("hr");
        // --- Add/Edit Area ---
        contentEl.createEl("h4", {
          text:
            this.editIndex === -1
              ? runtimeContext.t("HEADING_ADD_NEW_COLOR")
              : runtimeContext.t("HEADING_EDIT_COLOR"),
        });
        const getHex = (val) => {
          const cm = runtimeContext.ea.getCM(val);
          return cm
            ? cm.stringHEX({
                alpha: false,
              })
            : "#000000";
        };
        const updateEditorState = (val, textComp, pickerComp) => {
          this.tempColor = val;
          if (textComp) textComp.inputEl.value = val;
          if (pickerComp) pickerComp.setValue(getHex(val));
        };
        let textComponent, pickerComponent;
        new runtimeContext.ea.obsidian.Setting(contentEl)
          .setName(runtimeContext.t("LABEL_SELECT_COLOR"))
          .addText((text) => {
            textComponent = text;
            text.setValue(this.tempColor).onChange((value) => {
              this.tempColor = value;
              pickerComponent.setValue(getHex(value));
            });
          })
          .addColorPicker((picker) => {
            pickerComponent = picker;
            picker.setValue(getHex(this.tempColor)).onChange((value) => {
              this.tempColor = value;
              textComponent.setValue(value);
            });
          })
          .addButton((btn) =>
            btn
              .setIcon("swatch-book")
              .setTooltip(runtimeContext.t("TOOLTIP_OPEN_PALETTE_PICKER"))
              .onClick(async () => {
                const selected = await runtimeContext.ea.showColorPicker(
                  btn.buttonEl,
                  "elementStroke",
                );
                if (selected) {
                  updateEditorState(selected, textComponent, pickerComponent);
                }
              }),
          );
        const actionContainer = contentEl.createDiv();
        actionContainer.style.display = "flex";
        actionContainer.style.justifyContent = "flex-end";
        actionContainer.style.gap = "10px";
        actionContainer.style.marginTop = "10px";
        if (this.editIndex !== -1) {
          const cancelBtn = actionContainer.createEl("button", {
            text: runtimeContext.t("BUTTON_CANCEL_EDIT"),
          });
          cancelBtn.onclick = () => {
            this.editIndex = -1;
            this.tempColor = "#000000";
            this.display();
          };
        }
        const saveBtn = actionContainer.createEl("button", {
          text:
            this.editIndex === -1
              ? runtimeContext.t("BUTTON_ADD_COLOR")
              : runtimeContext.t("BUTTON_UPDATE_COLOR"),
          cls: "mod-cta",
        });
        saveBtn.onclick = () => {
          if (this.editIndex === -1) {
            this.settings.colors.push(this.tempColor);
          } else {
            this.settings.colors[this.editIndex] = this.tempColor;
            this.editIndex = -1;
          }
          this.save();
          this.display();
        };
      }
    }
    save() {
      this.onUpdate(this.settings);
    }
  }
  return { PaletteManagerModal };
}
