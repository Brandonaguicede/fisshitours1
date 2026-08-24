import { ModalShell, type ModalShellProps } from '../ui/ModalShell';

export type ModalProps = Omit<ModalShellProps, 'tone'>;

export function Modal(props: ModalProps) {
  return <ModalShell {...props} tone="light" />;
}
