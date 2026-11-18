/**
 * Point d'entrée de la CLI TypeORM (npm run migration:run / migration:revert / migration:show).
 * Lit la même configuration que l'application, depuis .env.
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm.config';

export default new DataSource(buildDataSourceOptions());
