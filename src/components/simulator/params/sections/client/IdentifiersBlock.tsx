import React from 'react';
import { AlertTriangle, Lock, Unlock } from 'lucide-react';
import type { ClientInfo } from '../../../../../types';
import { formatProposalDate, getProposalDateInputValue } from '../../../../../utils/formatDateUtils';
import { Field, FieldAction, ParamRow, StackedField, SubHeader, SubHeaderTextButton } from '../../ui';
import { displayQuoteNumber, duplicateMessage, type DuplicateCheck } from './clientLogic';

export interface IdentifiersBlockProps {
  client: ClientInfo;
  isIdUnlocked: boolean;
  setIsIdUnlocked: (value: boolean) => void;
  duplicate: DuplicateCheck;
  /** Código libre siguiente: `generateNextProjectSequence(projects)`. */
  onAssignNext: () => void;
  updateClient: (client: Partial<ClientInfo>) => void;
}

const invalidShell = '[&>div]:border-pd-negative';

/** ID, cotización y fecha. Los identificadores se editan solo desbloqueados. */
export const IdentifiersBlock: React.FC<IdentifiersBlockProps> = ({ client, isIdUnlocked, setIsIdUnlocked, duplicate, onAssignNext, updateClient }) => {
  const message = duplicateMessage(duplicate, client);
  const noticeId = 'pd-cli-duplicate';
  return (
    <>
      <SubHeader
        title="Identificadores"
        action={
          <SubHeaderTextButton
            pressed={isIdUnlocked}
            icon={isIdUnlocked ? <Unlock size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
            title={isIdUnlocked ? 'Bloquear identificadores automáticos' : 'Desbloquear para editar manualmente el ID o la cotización'}
            onClick={() => setIsIdUnlocked(!isIdUnlocked)}
          >
            {isIdUnlocked ? 'Editable' : 'Bloqueado'}
          </SubHeaderTextButton>
        }
      />
      <div className="grid grid-cols-2 gap-2.5">
        <StackedField label="ID proyecto" htmlFor="pd-cli-id">
          <div className={isIdUnlocked && duplicate.isProjectIdDuplicate ? invalidShell : undefined}>
            <Field
              id="pd-cli-id"
              mono
              locked={!isIdUnlocked}
              value={client.projectId}
              aria-invalid={duplicate.isProjectIdDuplicate || undefined}
              aria-describedby={message ? noticeId : undefined}
              onChange={value => updateClient({ projectId: value })}
            />
          </div>
        </StackedField>
        <StackedField label="Cotización" htmlFor="pd-cli-quote">
          <div className={isIdUnlocked && duplicate.isQuoteDuplicate ? invalidShell : undefined}>
            <Field
              id="pd-cli-quote"
              mono
              locked={!isIdUnlocked}
              value={displayQuoteNumber(client)}
              aria-invalid={duplicate.isQuoteDuplicate || undefined}
              aria-describedby={message ? noticeId : undefined}
              onChange={value => updateClient({ quoteNumber: value })}
            />
          </div>
        </StackedField>
      </div>
      {message && (
        <div id={noticeId} role="alert" className="flex items-start gap-2 rounded-md border border-pd-negative px-2.5 py-2 text-xs text-pd-negative">
          <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 flex-none" />
          <div className="min-w-0 flex-1">
            <span>{message}</span>
            <button type="button" onClick={onAssignNext} className="mt-1 block cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-pd-negative underline">
              Asignar siguiente código
            </button>
          </div>
        </div>
      )}
      <ParamRow label="Fecha de emisión" htmlFor="pd-cli-date">
        <Field
          id="pd-cli-date"
          type="date"
          mono
          value={getProposalDateInputValue(client.quoteDate)}
          title={formatProposalDate(client.quoteDate, 'numeric')}
          onChange={value => updateClient({ quoteDate: value })}
          right={
            client.quoteDate ? (
              <FieldAction aria-label="Restablecer a Hoy" title="Restablecer a Hoy" onClick={() => updateClient({ quoteDate: undefined })}>
                Hoy
              </FieldAction>
            ) : undefined
          }
        />
      </ParamRow>
    </>
  );
};
