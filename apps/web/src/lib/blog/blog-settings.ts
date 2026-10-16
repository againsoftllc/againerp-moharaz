export type BlogSettings = {
  id: string;
  enabled: boolean;
  postsPerPage: number;
  commentsEnabled: boolean;
  moderateComments: boolean;
  rssEnabled: boolean;
  rssItemsLimit: number;
  defaultAuthor: string;
  showRelatedProducts: boolean;
  seoIndexBlog: boolean;
  blogBaseSlug: string;
  createdAt: string;
  updatedAt: string;
};

export type BlogSettingsInput = Partial<{
  enabled: boolean;
  postsPerPage: number;
  commentsEnabled: boolean;
  moderateComments: boolean;
  rssEnabled: boolean;
  rssItemsLimit: number;
  defaultAuthor: string;
  showRelatedProducts: boolean;
  seoIndexBlog: boolean;
  blogBaseSlug: string;
}>;

export const defaultBlogSettingsValues = (): BlogSettings => ({
  id: "default",
  enabled: true,
  postsPerPage: 12,
  commentsEnabled: true,
  moderateComments: true,
  rssEnabled: true,
  rssItemsLimit: 20,
  defaultAuthor: "Admin",
  showRelatedProducts: true,
  seoIndexBlog: true,
  blogBaseSlug: "blog",
  createdAt: "",
  updatedAt: "",
});
