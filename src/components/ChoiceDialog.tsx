import { useEffect, useRef, type ReactNode } from 'react';

export interface Choice<T extends string> {
  value: T;
  label: string;
  description?: string;
  tone?: 'primary' | 'danger';
}

interface Props<T extends string> {
  title: string;
  children?: ReactNode;
  choices: Choice<T>[];
  onChoose: (value: T) => void;
  onCancel: () => void;
}

/** Modal with several labelled choices plus cancel. Uses <dialog> for focus trapping and Esc. */
export function ChoiceDialog<T extends string>({ title, children, choices, onChoose, onCancel }: Props<T>) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="choice-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id="choice-dialog-title">{title}</h2>
      {children}
      <div className="dialog-choices">
        {choices.map((c) => (
          <button key={c.value} type="button" className={`choice ${c.tone ?? ''}`} onClick={() => onChoose(c.value)}>
            <strong>{c.label}</strong>
            {c.description && <span>{c.description}</span>}
          </button>
        ))}
        <button type="button" className="ghost" onClick={onCancel}>
          취소
        </button>
      </div>
    </dialog>
  );
}
