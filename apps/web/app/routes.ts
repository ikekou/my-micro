import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("posts/:id", "routes/post.tsx"),
  route("authors/:id", "routes/author.tsx"),
  route("share", "routes/share.tsx"),
  route("login", "routes/login.tsx"),
  route("device", "routes/device.tsx"),
  route("me/posts", "routes/my-posts.tsx"),
  route("me/account", "routes/account.tsx"),
  route("about", "routes/about.tsx"),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
