declare module '@tryghost/admin-api' {
  interface GhostAdminAPIOptions {
    url: string;
    key: string;
    version: string;
  }

  interface Post {
    id: string;
    title: string;
    slug: string;
    html?: string;
    url: string;
    published_at?: string;
    custom_excerpt?: string;
    meta_title?: string;
    meta_description?: string;
    feature_image?: string;
    tags?: Array<{ name: string }>;
    status: string;
  }

  interface PostsAPI {
    browse(options?: {
      limit?: number;
      page?: number;
      fields?: string;
      filter?: string;
      order?: string;
    }): Promise<Post[] & { meta?: { pagination?: { next: number | null } } }>;
    add(data: any, options?: { source?: string }): Promise<Post>;
  }

  class GhostAdminAPI {
    constructor(options: GhostAdminAPIOptions);
    posts: PostsAPI;
  }

  export default GhostAdminAPI;
}
