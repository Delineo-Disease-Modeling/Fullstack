import 'dotenv/config';

export const PORT: string = process.env.PORT ?? '1890';
export const GOOGLE_API_KEY: string = process.env.GOOGLE_API_KEY!;
export const DB_FOLDER: string = process.env.DB_FOLDER! ?? './db/';
