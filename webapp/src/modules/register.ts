/**
 * Registers every built-in ConverterModule with the platform registry (E0.2,
 * issue #22). Imported once, for its side effect, from root.tsx - which wraps every
 * route, so by the time any component renders and looks a module up via
 * registry.get(), it's already there no matter which page was entered first.
 * Audio (#23) and image (E2.1, issue #31). Registering a module here is what makes
 * its category live everywhere at once - routes, prerendered pages, the mega-menu,
 * the Cmd+K palette, the home grid - since all of them gate on the graph having
 * edges AND the registry having a module for that category.
 */
import { register } from '../platform/registry'
import { audioModule } from './audio'
import { imageModule } from './image'
import { pdfModule } from './pdf'

register(audioModule)
register(imageModule)
register(pdfModule)
