/**
 * The application's definition of the default color black.
 */
const BLACK = '#111111';

/**
 * The application's color palette.
 */
export const ColorPalette = {
    /**
     * The application's background color.
     */
    appBackground: BLACK,

    /**
     * The application's definition of the default color black. Generally,
     * expected to be kept in sync with the application's background color for
     * the sake of consistency.
     */
    black: BLACK,
    blackBlue: BLACK,//'rgb(0, 3, 6)',
    blue: BLACK,//'#17A0DB',
    blueHighlight: BLACK,//'#1081b2',
    buttonUnderlay: BLACK,//'#495258',
    darkGrey: BLACK,//'#555555',
    green: BLACK,//'#40b183',
    lightGrey: BLACK,//'#AAAAAA',
    overflowMenuItemUnderlay: BLACK,//'#EEEEEE',
    red: BLACK,//'#D00000',
    transparent: 'rgba(0, 0, 0, 0)',
    warning: BLACK,//'rgb(215, 121, 118)',
    white: BLACK,//'#FFFFFF',

    /**
     * These are colors from the atlaskit to be used on mobile, when needed.
     *
     * FIXME: Maybe a better solution would be good, or a native packaging of
     * the respective atlaskit components.
     */
    G400: BLACK,//'#00875A', // Slime
    N500: BLACK,//'#42526E', // McFanning
    R400: BLACK,//'#DE350B', // Red dirt
    Y200: BLACK,//'#FFC400' // Pub mix
};
