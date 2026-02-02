
export interface OpenFoodFactsProduct {
    code: string;
    product_name: string;
    brands: string;
    nutriments: {
        "energy-kcal_100g"?: number;
        proteins_100g?: number;
        carbohydrates_100g?: number;
        fat_100g?: number;
        fiber_100g?: number;
        sugars_100g?: number;
        [key: string]: number | undefined;
    };
    serving_size?: string;
    serving_quantity?: string | number;
    image_url?: string;
    categories_tags?: string[];
}

export interface SearchResult {
    count: number;
    page: number;
    page_size: number;
    products: OpenFoodFactsProduct[];
}

const BASE_URL = "https://world.openfoodfacts.org/cgi/search.pl";

/**
 * Searches the Open Food Facts API for products matching the query.
 * 
 * @param query The search term (e.g., "cheerios", "banana")
 * @param limit Number of results to return (default: 5)
 * @returns List of matching products with basic nutritional info
 */
export async function searchProducts(query: string, limit: number = 5): Promise<OpenFoodFactsProduct[]> {
    try {
        const params = new URLSearchParams({
            search_terms: query,
            search_simple: "1",
            action: "process",
            json: "1",
            page_size: limit.toString(),
            fields: "code,product_name,brands,nutriments,serving_size,serving_quantity,image_url,categories_tags"
        });

        const response = await fetch(`${BASE_URL}?${params.toString()}`);

        if (!response.ok) {
            console.error("OpenFoodFacts API error:", response.status, response.statusText);
            return [];
        }

        const data = (await response.json()) as SearchResult;
        return data.products || [];
    } catch (error) {
        console.error("Failed to search Open Food Facts:", error);
        return [];
    }
}

/**
 * Fetches detailed information for a specific product by its barcode/ID.
 */
export async function getProductDetails(code: string): Promise<OpenFoodFactsProduct | null> {
    try {
        const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
        if (!response.ok) return null;

        const data = await response.json();
        if (data.status === 1 && data.product) {
            return data.product as OpenFoodFactsProduct;
        }
        return null;
    } catch (error) {
        console.error("Error fetching product details:", error);
        return null;
    }
}
