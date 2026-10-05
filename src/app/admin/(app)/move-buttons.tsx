type Action = (fd: FormData) => Promise<void>;

/**
 * Op og ned knapper inde i en formular. De sender formularens id med til flyt-handlingen.
 * Hver retning har sin egen handling, da React erstatter knappens name, når den har sin egen formAction.
 */
export function MoveButtons(props: { up: Action; down: Action; first: boolean; last: boolean; label: string }) {
  return (
    <>
      <button className="secondary small" type="submit" formAction={props.up} formNoValidate disabled={props.first} aria-label={`Flyt ${props.label} op`}>
        ↑
      </button>
      <button className="secondary small" type="submit" formAction={props.down} formNoValidate disabled={props.last} aria-label={`Flyt ${props.label} ned`}>
        ↓
      </button>
    </>
  );
}
