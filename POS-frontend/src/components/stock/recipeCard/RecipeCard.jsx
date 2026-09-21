import api from '/src/api.js';
import './RecipeCard.css';
import { Trash, PenLine, X, CirclePlus } from 'lucide-react';
import { useState, useEffect } from 'react';

function RecipeCard({ data, ingredients, onRecipeEdit }) {
  const [isRecipePopupOpen, setIsRecipePopupOpen] = useState(false);
  const [isIngredientPopupOpen, setIsIngredientPopupOpen] = useState(false);
  const [popupItems, setPopupItems] = useState([]);

  const getInitialItems = () => {
    const items = typeof data.linked_items === 'string' ? JSON.parse(data.linked_items) : (data.linked_items || []);
    return items.filter(item => item && (item.item_id || item.id));
  };

  useEffect(() => {
    if (isRecipePopupOpen) {
      setPopupItems(getInitialItems());
    }
  }, [isRecipePopupOpen, data.linked_items]);

  const handleQtyChange = (id, newQty) => {
    setPopupItems(prev => prev.map(item => {
      const itemId = item.item_id || item.id;
      return itemId === id ? { ...item, qty: Number(newQty) } : item;
    }));
  };

  const handleRemoveIngredient = async (ingredientId) => {
    const isConfirmed = window.confirm("Are you sure you want to delete this?");
    if (isConfirmed) {
      if (!ingredientId || !data.product_id) {
        console.error("Error: Cannot delete due to missing product or ingredient identifiers.");
        return;
      }

      try {
        const res = await api.delete(`/api/stock/recipe/${data.product_id}/${ingredientId}`);
        if (res.status === 200) {
          console.log(`Ingredient ${ingredientId} removed from recipe ${data.product_id}`);
          setPopupItems(prev => prev.filter(item => (item.item_id || item.id) !== ingredientId));
          if (onRecipeEdit) onRecipeEdit();
        }
      } catch (error) {
        console.error('Error deleting ingredient:', error.response?.data?.error || error.message);
      }
    }
  };

  const handleFormSubmit = async (e) => {
    if (e) e.preventDefault();
    try {
      const res = await api.patch(`/api/stock/recipe/${data.product_id}`, { linked_items: popupItems });
      if (res.status === 200) {
        console.log("Data updated successfully");
        setIsRecipePopupOpen(false);
        if (onRecipeEdit) onRecipeEdit();
      } else {
        console.log(`Error: ${res.data.message}`);
      }
    } catch (error) {
      console.log("Network error while trying to send data", error);
    }
  };

  const handleAddRecipe = async (e) => {
    if (e) e.preventDefault();
    const form = e.target;
    const item_id = form.elements.item_id.value;
    const qty = form.elements.qty.value;
    if (!item_id) {
      console.error("Please select an ingredient.");
      return;
    };
    const payload = {
      item_id: item_id,
      qty: Number(qty) || 0
    };
    try {
      const res = await api.post(`/api/stock/recipe/${data.product_id}`, payload);
      if (res.status === 201) {
        console.log(`Ingredient added to the recipe`)
        if (onRecipeEdit) onRecipeEdit()
        setIsIngredientPopupOpen(false)
        form.reset();
      }
    } catch (error) {
      console.error('Error while adding to recipe: ', error.response?.data?.error || error.message);
    }
  }

  const validItems = getInitialItems();

  return (
    <>
      {isRecipePopupOpen && (
        <div className='recipePopup'>
          <form className='recipePopup-container' onSubmit={handleFormSubmit}>
            <div className='recipePopup-head'>
              <p>Edit Product Recipe</p>
              <button type="button" className='close-btn' onClick={() => setIsRecipePopupOpen(false)}>
                <X />
              </button>
            </div>
            <div className='recipePopup-linked-ingredients-area'>
              <div className='recipePopup-linked-ingredients'>
                {popupItems.length > 0 ? (
                  popupItems.map((item) => {
                    const itemId = item.item_id || item.id;
                    const itemName = item.item_name || item.name;
                    return (
                      <div key={itemId} className='ingredient'>
                        <span className='ingredient-name'>{itemName}</span>
                        <input
                          type="number"
                          min={0.01}
                          step="any"
                          value={item.qty || ''}
                          onChange={(e) => handleQtyChange(itemId, e.target.value)}
                        />
                        <span>{item.uom}</span>
                        <button
                          type="button"
                          className='delete-btn action-btn'
                          onClick={() => handleRemoveIngredient(itemId)}
                        >
                          <Trash />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p className='no-data'>No ingredients linked</p>
                )}
              </div>
              <div className='recipePopup-actions'>
                <button className='save-btn' type='submit'>Save Changes</button>
              </div>
            </div>
          </form>
        </div>
      )}
      {isIngredientPopupOpen && (
        <div className='recipePopup'>
          <form className='recipePopup-container' onSubmit={handleAddRecipe}>
            <div className='recipePopup-head'>
              <p>Add Product Recipe</p>
              <button type="button" className='close-btn' onClick={() => setIsIngredientPopupOpen(false)}>
                <X />
              </button>
            </div>
            <div className='input-area'>
              <div className='label-input'>
                <label htmlFor="select_ingredient">Ingredient:</label>
                <select className="general-select" id="select_ingredient" name="item_id" required>
                  <option value="">Select an ingredient...</option>
                  {ingredients.map((ingredient) => {
                    const ingId = ingredient.item_id || ingredient.id;
                    const ingName = ingredient.item_name || ingredient.name;
                    return (
                      <option key={ingId} value={ingId}>{ingName}</option>
                    );
                  })}
                </select>
              </div>
              <div className="label-input">
                <label htmlFor="quantity_input">Quantity on Use:</label>
                <input type="number" min="0.01" step="any" id="quantity_input" name='qty' required />
              </div>
              <div className='recipePopup-actions'>
                <button className='recipePopup-submit' type='submit'>Save Changes</button>
              </div>
            </div>
          </form>
        </div>
      )}
      <div className='recipe-card'>
        <div className='recipe-head'>
          <div className='recipe-head-left'>
            <p>{data.product_category}</p>
            <h4>{data.product_name}</h4>
          </div>
        </div>
        <div className='linked-ingredients'>
          <h4>Linked ingredient</h4>
          <div className='ingredients'>
            {validItems.length > 0 ? (
              validItems.map((item) => {
                const itemId = item.item_id || item.id;
                const itemName = item.item_name || item.name;
                return (
                  <div key={itemId} className='ingredient'>
                    <span className='ingredient-name'>{itemName}</span>
                    <span className='ingredient-qty'>{item.qty}{item.uom}</span>
                  </div>
                );
              })
            ) : (
              <p className='no-data'>No ingredients linked</p>
            )}
          </div>
        </div>
        <div className="recipe-actions">
          <div className='recipe-action-btns'>
            <div className='stock-action-btn-container'>
              <button className='add-stock-btn action-btn' onClick={() => setIsIngredientPopupOpen(true)}>
                <CirclePlus />
              </button>
              <button className='edit-btn action-btn' onClick={() => setIsRecipePopupOpen(true)}>
                <PenLine />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default RecipeCard;
