// Native targets always present options in the dialog: there is no pointer to
// anchor a popover for, and on tvOS the modal confines the remote. The web
// half, which can have both, is in ./select-options.web.

export { SelectOptionsDialog as SelectOptions } from './select-options-dialog';
