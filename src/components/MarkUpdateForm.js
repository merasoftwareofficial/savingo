import React, { useState, useEffect } from "react";

const MarkUpdateForm = () => {
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [updateType, setUpdateType] = useState("frontend");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Fetch customers from API
    const fetchCustomers = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/ota/customers`);
        const data = await response.json();
        setCustomers(data);
      } catch (err) {
        console.error("Failed to fetch customers:", err);
      }
    };
    fetchCustomers();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    console.log("Selected Customer ID:", customerId);
    
    try {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/ota/mark-update-available`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerId: customerId,
            updateType: updateType,
          }),
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("API Error Response:", errorText);
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log("checking data:", data);
      
      setMessage("Update marked as available successfully!");
      
    } catch (err) {
      setMessage(`Error: ${err.message}`);
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h2>Mark Update Available</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="customer">Select Customer:</label>
          <select
            id="customer"
            value={customerId}
            onChange={(e) => {
              console.log("Customer selected:", e.target.value); // यहाँ लॉग करें
              setCustomerId(e.target.value);
            }}
            required
          >
            <option value="">Select a customer</option>
            {customers.map((customer) => (
              <option key={customer._id} value={customer._id}>
                {customer.name || customer.githubUsername}
              </option>
            ))}
          </select>
        </div>
        
        <div className="form-group">
          <label htmlFor="updateType">Update Type:</label>
          <select
            id="updateType"
            value={updateType}
            onChange={(e) => setUpdateType(e.target.value)}
          >
            <option value="frontend">Frontend</option>
            <option value="backend">Backend</option>
          </select>
        </div>
        
        <button type="submit" disabled={loading}>
          {loading ? "Processing..." : "Mark Update Available"}
        </button>
        
        {message && <div className="message">{message}</div>}
      </form>
    </div>
  );
};

export default MarkUpdateForm;