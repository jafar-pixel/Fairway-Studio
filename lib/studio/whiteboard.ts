/** Idea whiteboards: shared types, input validation and the UI's view of the rules of engagement.
 * The database function studio_board_mutate is the authority; these helpers only decide what to offer. */
export type BoardScope = "team" | "private";
export type BoardItemKind = "note" | "swatch" | "fabric" | "image" | "library";
export type Board = { id: string; workspace_id: string; idea_id: string; scope: BoardScope; owner_id: string; created_at: string };
export type BoardItem = {
  id: string; board_id: string; kind: BoardItemKind; title: string; body: string;
  color: string | null; url: string | null; image_url: string | null;
  reference_id: string | null; file_id: string | null;
  x: number; y: number; width: number; height: number;
  created_by: string; checked_out_by: string | null; checked_out_at: string | null;
  revision: number; created_at: string; updated_at: string;
};
export type BoardComment = { id: string; board_id: string; item_id: string | null; author_id: string; body: string; created_at: string };
export type BoardSnapshot = { boards: Board[]; items: BoardItem[]; comments: BoardComment[] };

export const BOARD_OPERATIONS = ["ensureBoards", "addItem", "updateItem", "deleteItem", "checkOut", "checkIn", "copyToPrivate", "addComment", "deleteComment"] as const;
export type BoardOperation = (typeof BOARD_OPERATIONS)[number];
export const ITEM_KINDS: BoardItemKind[] = ["note", "swatch", "fabric", "image", "library"];
export const ITEM_LABELS: Record<BoardItemKind, string> = { note: "Note", swatch: "Colour", fabric: "Fabric", image: "Image", library: "Library item" };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hex = /^#[0-9a-f]{6}$/i;
const finite = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const text = (value: unknown, max: number) => typeof value === "string" && value.length <= max;
const https = (value: unknown) => value === "" || (typeof value === "string" && value.length <= 2000 && /^https:\/\/[^\s]+$/i.test(value));

/** Reject anything the database would reject, so the user gets a clear message before a round trip. */
export function boardInputError(operation: string, input: Record<string, unknown>): string | null {
  if (!(BOARD_OPERATIONS as readonly string[]).includes(operation)) return "Unsupported whiteboard action.";
  for (const key of ["created_by", "author_id", "owner_id", "workspace_id", "checked_out_by"]) if (key in input) return "Identity is assigned by the server.";
  const id = (key: string) => typeof input[key] === "string" && uuid.test(input[key] as string);
  if (operation === "ensureBoards") return id("idea_id") ? null : "Choose an idea.";
  if (operation === "addComment") {
    if (!id("board_id")) return "Choose a board.";
    if (input.item_id != null && !id("item_id")) return "Choose a board item.";
    return typeof input.body === "string" && input.body.trim().length > 0 && input.body.length <= 2000 ? null : "Write a comment up to 2,000 characters.";
  }
  if (operation === "addItem") {
    if (!id("board_id")) return "Choose a board.";
    if (!ITEM_KINDS.includes(input.kind as BoardItemKind)) return "Choose what to add.";
    if (input.kind === "library" && !id("reference_id") && !id("file_id")) return "Choose a Library item.";
  } else if (!id("id")) return "Choose a board item.";
  if (operation === "updateItem" && !(typeof input.expected_revision === "number" && Number.isInteger(input.expected_revision))) return "Reload the board and try again.";
  if ("title" in input && !text(input.title, 200)) return "Titles can be up to 200 characters.";
  if ("body" in input && !text(input.body, 4000)) return "Notes can be up to 4,000 characters.";
  if ("color" in input && input.color !== "" && !(typeof input.color === "string" && hex.test(input.color))) return "Choose a colour like #760D24.";
  if ("url" in input && !https(input.url)) return "Links must start with https://.";
  if ("image_url" in input && !https(input.image_url)) return "Image links must start with https://.";
  for (const [key, min, max] of [["x", -20000, 20000], ["y", -20000, 20000], ["width", 80, 1200], ["height", 60, 1200]] as const) {
    if (key in input && !finite(input[key], min, max)) return "That position is outside the board.";
  }
  return null;
}

/** What the signed-in member may do with an item, mirroring studio_board_mutate. */
export function itemPermissions(board: Board, item: BoardItem, userId: string) {
  const owner = board.owner_id === userId;
  const author = item.created_by === userId;
  return {
    move: owner,
    edit: owner || author,
    remove: owner || author,
    checkOut: !item.checked_out_by,
    checkIn: !!item.checked_out_by && (item.checked_out_by === userId || owner),
    copyToPrivate: board.scope === "team",
  };
}

export function boardRulesSummary(board: Board, userId: string): string {
  if (board.scope === "private") return "Only you can see this board.";
  return board.owner_id === userId
    ? "Your team can see this board, add items and comment. Only you can move things."
    : "You can add items, comment, check items out and copy them to your private board. Only the idea's owner moves things.";
}
