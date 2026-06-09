const LocalStrategy = require("passport-local").Strategy;
// const GoogleStrategy = require("passport-google-oauth20").Strategy;
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

module.exports = function (passport) {
  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        try {
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) {
            return done(null, false, { message: "Email ou senha inválidos" });
          }
          if (!user.password) {
            return done(null, false, {
              message: "Conta vinculada ao Google. Faça login com Google.",
            });
          }
          const match = await bcrypt.compare(password, user.password);
          if (!match) {
            return done(null, false, { message: "Email ou senha inválidos" });
          }
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  // passport.use(
  //   new GoogleStrategy(
  //     {
  //       clientID: process.env.GOOGLE_CLIENT_ID,
  //       clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  //       callbackURL: process.env.GOOGLE_CALLBACK_URL,
  //     },
  //     async (accessToken, refreshToken, profile, done) => {
  //       try {
  //         let user = await prisma.user.findUnique({
  //           where: { googleId: profile.id },
  //         });
  //         if (user) return done(null, user);
  //
  //         user = await prisma.user.findUnique({
  //           where: { email: profile.emails[0].value },
  //         });
  //         if (user) {
  //           user = await prisma.user.update({
  //             where: { id: user.id },
  //             data: { googleId: profile.id, avatar: profile.photos[0]?.value },
  //           });
  //           return done(null, user);
  //         }
  //
  //         user = await prisma.user.create({
  //           data: {
  //             name: profile.displayName,
  //             email: profile.emails[0].value,
  //             googleId: profile.id,
  //             avatar: profile.photos[0]?.value,
  //           },
  //         });
  //         return done(null, user);
  //       } catch (err) {
  //         return done(err);
  //       }
  //     }
  //   )
  // );

  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      done(null, user);
    } catch (err) {
      done(err);
    }
  });
};
