/* global module, process, require */
module.exports = function babelRoot(api) {
  api.cache(true);

  if (process.env.NODE_ENV === 'test') {
    require('@babel/register')({
      // This will override `node_modules` ignoring - you can alternatively pass
      // an array of strings to be explicitly matched or a regex / glob
      ignore: ['node_modules/lodash'],
    });
  }

  return {
    presets: [
      [
        '@babel/env', {
          targets: {
            node: 'current',
          },
        }
      ]
    ],
  };
};
