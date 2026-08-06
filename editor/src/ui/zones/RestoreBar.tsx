import type {Settings} from '../types';

/**
 * Две полосы возврата к версии, обе решает человек, а не программа.
 *
 * «Заменить работу?» — спрашивается до подстановки: заменённая работа в черновике не остаётся,
 * и после закрытия программы её будет не вернуть.
 * «Вернуть как было» — обещание обратимости. Отмена в редакторе им быть не может: она знает
 * только текст, а возврат меняет пару «тело + шапка», и её отмена дала бы смесь двух состояний.
 */
export function RestoreBars(props: {
  settings: Settings;
  спрашиваем: boolean;
  откатДоступен: boolean;
  onПодтвердить: () => void;
  onОтменить: () => void;
  onОткатить: () => void;
}) {
  const п = props.settings.подписи;

  return (
    <>
      {props.спрашиваем && (
        <div className="conflictbar" role="alert">
          <span>{п.подтвердитьВозврат}</span>
          <button className="ghost" onClick={props.onПодтвердить}>{п.вернутьВсёРавно}</button>
          <button className="ghost" onClick={props.onОтменить}>{п.неВозвращать}</button>
        </div>
      )}

      {props.откатДоступен && (
        <div className="conflictbar" role="status">
          <span>{п.версияВозвращена}</span>
          <button className="ghost" onClick={props.onОткатить}>{п.вернутьКакБыло}</button>
        </div>
      )}
    </>
  );
}
