/** Extract file ID from any Google Drive/Docs/Sheets/Slides URL. Returns null if not parseable. */
export declare function extractFileId(url: string): string | null;
/** Export a Google Doc/Sheet/Slide/PDF as plain text. Returns text content or null on error. */
export declare function fetchDriveFileAsText(fileId: string): Promise<{
    text: string;
    name: string;
    mimeType: string;
} | null>;
export type DriveFolderFile = {
    id: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
    thumbnailLink?: string;
    iconLink?: string;
    modifiedTime?: string;
};
/** List files in a Drive folder (non-recursive, first 50). */
export declare function listDriveFolderFiles(folderId: string): Promise<DriveFolderFile[]>;
/** Get metadata for a single Drive file/folder (lightweight). */
export declare function getDriveFileMeta(fileId: string): Promise<{
    id: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
} | null>;
/** Download a file from Drive and return it as base64. */
export declare function fetchDriveFileAsBase64(fileId: string): Promise<{
    base64: string;
    name: string;
} | null>;
//# sourceMappingURL=driveService.d.ts.map