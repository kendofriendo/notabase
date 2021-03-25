import {
  Editor as SlateEditor,
  Element as SlateElement,
  Transforms,
  Range,
  Point,
  Text,
  Path,
} from 'slate';
import { ReactEditor } from 'slate-react';

const BLOCK_SHORTCUTS = [
  { match: /^(\*|-|\+)$/, type: 'list-item', listType: 'bulleted-list' }, // match *, -, or +
  { match: /^([0-9]+\.)$/, type: 'list-item', listType: 'numbered-list' }, // match numbered lists
  { match: /^>$/, type: 'block-quote' },
  { match: /^#$/, type: 'heading-one' },
  { match: /^##$/, type: 'heading-two' },
  { match: /^###$/, type: 'heading-three' },
];

const INLINE_SHORTCUTS = [
  { match: /(?:^|\s)(\*\*)([^*]+)(\*\*)/, type: 'bold' },
  { match: /(?:^|\s)(__)([^_]+)(__)/, type: 'bold' },
  { match: /(?:^|\s)(\*)([^*]+)(\*)/, type: 'italic' },
  { match: /(?:^|\s)(_)([^_]+)(_)/, type: 'italic' },
  { match: /(?:^|\s)(`)(.+)(`)/, type: 'code' },
  { match: /(?:^|\s)(\[)(.+)(\]\()(.+)(\))/, type: 'link' },
];

// Add auto-markdown formatting shortcuts
const withAutoMarkdown = (editor: ReactEditor) => {
  const { deleteBackward, insertText } = editor;

  editor.insertText = (text) => {
    const { selection } = editor;

    if (!selection || !Range.isCollapsed(selection)) {
      insertText(text);
      return;
    }

    const { anchor } = selection;

    // Handle shortcuts at the beginning of a line
    if (text === ' ') {
      const block = SlateEditor.above(editor, {
        match: (n) => SlateEditor.isBlock(editor, n),
      });
      const path = block ? block[1] : [];
      const lineStart = SlateEditor.start(editor, path);
      const beforeRange = { anchor, focus: lineStart };
      const beforeText = SlateEditor.string(editor, beforeRange);

      // Handle block shortcuts
      for (const shortcut of BLOCK_SHORTCUTS) {
        if (beforeText.match(shortcut.match)) {
          const type = shortcut.type;

          Transforms.select(editor, beforeRange);
          Transforms.delete(editor);
          const newProperties: Partial<SlateElement> = {
            type,
          };
          Transforms.setNodes(editor, newProperties, {
            match: (n) => SlateEditor.isBlock(editor, n),
          });

          if (type === 'list-item') {
            const list = {
              type: shortcut.listType,
              children: [],
            };
            Transforms.wrapNodes(editor, list, {
              match: (n) =>
                !SlateEditor.isEditor(n) &&
                SlateElement.isElement(n) &&
                n.type === 'list-item',
            });
          }
          return;
        }
      }
    }

    // Handle inline shortcuts
    const elementStart = SlateEditor.start(editor, anchor.path);
    const elementRange = { anchor, focus: elementStart };
    const elementText = SlateEditor.string(editor, elementRange) + text;

    for (const { match, type } of INLINE_SHORTCUTS) {
      const result = elementText.match(match);

      if (!result) {
        continue;
      }

      const selectionPath = anchor.path;
      let endOfSelection = anchor.offset;

      if (type === 'bold' || type === 'italic' || type === 'code') {
        const [, startMark, textToFormat, endMark] = result;
        const endMarkLength = endMark.length - 1; // The last character is not in the editor

        // Delete the ending mark
        deleteText(editor, selectionPath, endOfSelection, endMarkLength);
        endOfSelection -= endMarkLength;

        // Delete the start mark
        deleteText(
          editor,
          selectionPath,
          endOfSelection - textToFormat.length,
          startMark.length
        );
        endOfSelection -= startMark.length;

        // Add formatting mark to the text to format
        const textToFormatRange = {
          anchor: {
            path: selectionPath,
            offset: endOfSelection,
          },
          focus: {
            path: selectionPath,
            offset: endOfSelection - textToFormat.length,
          },
        };
        Transforms.setNodes(
          editor,
          { [type]: true },
          { at: textToFormatRange, match: (n) => Text.isText(n), split: true }
        );
        SlateEditor.removeMark(editor, type);

        return;
      } else if (type === 'link') {
        const [, startMark, linkText, middleMark, linkUrl, endMark] = result;
        const endMarkLength = endMark.length - 1; // The last character is not in the editor

        // Delete the middle mark, link url, and end mark
        const endLength = middleMark.length + linkUrl.length + endMarkLength;
        deleteText(editor, selectionPath, endOfSelection, endLength);
        endOfSelection -= endLength;

        // Delete the start mark
        deleteText(
          editor,
          selectionPath,
          endOfSelection - linkText.length,
          startMark.length
        );
        endOfSelection -= startMark.length;

        // Wrap text in a link
        const linkTextRange = {
          anchor: {
            path: selectionPath,
            offset: endOfSelection,
          },
          focus: {
            path: selectionPath,
            offset: endOfSelection - linkText.length,
          },
        };
        const link = {
          type: 'link',
          url: linkUrl,
          children: [],
        };
        Transforms.wrapNodes(editor, link, {
          at: linkTextRange,
          split: true,
        });

        return;
      }
    }

    insertText(text);
  };

  editor.deleteBackward = (...args) => {
    const { selection } = editor;

    if (selection && Range.isCollapsed(selection)) {
      const match = SlateEditor.above(editor, {
        match: (n) => SlateEditor.isBlock(editor, n),
      });

      if (match) {
        const [block, path] = match;
        const start = SlateEditor.start(editor, path);

        if (
          !SlateEditor.isEditor(block) &&
          SlateElement.isElement(block) &&
          block.type !== 'paragraph' &&
          block.type !== 'list-item' &&
          Point.equals(selection.anchor, start)
        ) {
          const newProperties: Partial<SlateElement> = {
            type: 'paragraph',
          };
          Transforms.setNodes(editor, newProperties);
          return;
        }
      }

      deleteBackward(...args);
    }
  };

  return editor;
};

// Deletes `length` characters at the specified path and offset
const deleteText = (
  editor: ReactEditor,
  path: Path,
  offset: number,
  length: number
) => {
  const anchorOffset = offset - length;
  if (anchorOffset === offset) {
    return; // Don't delete anything if the two offsets are the same
  }
  const range = {
    anchor: { path, offset: anchorOffset },
    focus: { path, offset },
  };
  Transforms.delete(editor, { at: range });
};

export default withAutoMarkdown;