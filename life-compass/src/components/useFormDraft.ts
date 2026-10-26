"use client";

import { useEffect, type RefObject } from "react";

// 未提交的表单内容暂存在本机：断网、误关页面后重新打开会自动恢复。
// 只存在这台手机的浏览器里，不上传。提交成功后清除。
export function useFormDraft(ref: RefObject<HTMLFormElement | null>, key: string, onRestore?: (values: Record<string, string | boolean>) => void) {
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const values = JSON.parse(saved) as Record<string, string | boolean>;
        const apply = () => {
          for (const [name, value] of Object.entries(values)) {
            const els = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${CSS.escape(name)}"]`);
            els.forEach((el) => {
              if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
                el.checked = el.type === "checkbox" ? value === true : el.value === value;
              } else if (!(el instanceof HTMLInputElement && el.type === "hidden")) {
                el.value = String(value);
              }
            });
          }
        };
        apply();
        onRestore?.(values);
        // 有些字段要等状态恢复后才出现（例如选了「未开始」才显示障碍），稍后再填一次
        timer = setTimeout(apply, 50);
      }
    } catch {
      // 本地存储不可用时照常使用
    }
    const save = () => {
      try {
        const values: Record<string, string | boolean> = {};
        for (const el of Array.from(form.elements) as HTMLInputElement[]) {
          if (!el.name || el.type === "hidden" || el.type === "submit") continue;
          if (el.type === "checkbox") values[el.name] = el.checked;
          else if (el.type === "radio") {
            if (el.checked) values[el.name] = el.value;
          } else values[el.name] = el.value;
        }
        localStorage.setItem(key, JSON.stringify(values));
      } catch {
        // 忽略
      }
    };
    form.addEventListener("input", save);
    form.addEventListener("change", save);
    return () => {
      clearTimeout(timer);
      form.removeEventListener("input", save);
      form.removeEventListener("change", save);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, key]);
}

export function clearFormDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 忽略
  }
}
