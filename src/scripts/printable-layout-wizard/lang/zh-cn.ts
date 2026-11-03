import type { TranslationCatalog } from "../../../sharedUtils/i18n";
import type { WizardTranslationKey } from "./en";
/** Additional labels fall back to English. */
export const zhCn = {
  title: "页面管理",
  frames: "框架",
  printing: "打印",
  pages: "页码",
  pagesHint: "留空打印全部页面。例如：1, 3-5, 9-。按框架名称的字母顺序编号，然后跳过空白页。",
  invalidRange: "请输入页码或范围，如 1, 3-5, 9-。请使用正整数和递增范围。",
  pageList: "页面（{count}）：{names}",
  noPages: "没有可打印的页面。请检查页码范围和空白页设置。",
  print: "导出为 PDF",
} satisfies TranslationCatalog<WizardTranslationKey>;
